#!/usr/bin/env python3
"""
Editor-free verification for PRIVE.

Reads the .asmdef files under Assets/PRIVE, builds the assembly dependency graph,
topologically sorts it, and compiles every engine-free assembly separately with a
plain C# compiler. Because each assembly is compiled on its own with only its declared
references, this proves the graph in PRIVE_ARCHITECTURE.md is acyclic and complete --
the same guarantee Unity's asmdefs give, without opening the Editor.

Then it compiles the EditMode tests against a small NUnit shim and runs them.

Usage:  Tools/verify.sh  [--keep]
"""

import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "Assets", "PRIVE")
BUILD = os.path.join(ROOT, "Tools", "build")
VERIFY_SRC = os.path.join(ROOT, "Tools", "CoreVerify")

# Unity-provided assemblies that cannot be compiled outside the Editor. Assemblies
# depending on these are checked for graph validity but not compiled here.
UNITY_ONLY_REFERENCES = {"UnityEngine.TestRunner", "UnityEditor.TestRunner"}

GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
DIM = "\033[2m"
RESET = "\033[0m"


def find_compiler():
    for candidate in ("mcs", "csc", "dotnet"):
        path = subprocess.run(["which", candidate], capture_output=True, text=True).stdout.strip()
        if path:
            return candidate, path
    return None, None


def discover_assemblies():
    """Returns {name: {path, dir, references, no_engine, sources}}."""
    assemblies = {}
    for dirpath, _dirnames, filenames in os.walk(ASSETS):
        for filename in filenames:
            if not filename.endswith(".asmdef"):
                continue

            full = os.path.join(dirpath, filename)
            with open(full) as handle:
                data = json.load(handle)

            name = data["name"]
            sources = []
            for src_dir, _sub, src_files in os.walk(dirpath):
                # A nested asmdef owns its own folder; do not absorb its sources.
                if src_dir != dirpath and any(f.endswith(".asmdef") for f in os.listdir(src_dir)):
                    continue
                for src in sorted(src_files):
                    if src.endswith(".cs"):
                        sources.append(os.path.join(src_dir, src))

            assemblies[name] = {
                "path": full,
                "dir": dirpath,
                "references": list(data.get("references", [])),
                "no_engine": bool(data.get("noEngineReferences", False)),
                "sources": sorted(sources),
            }
    return assemblies


def topo_sort(assemblies):
    """Kahn's algorithm over internal references. Raises on a cycle."""
    internal = set(assemblies)
    indegree = {name: 0 for name in assemblies}
    dependents = {name: [] for name in assemblies}

    for name, info in assemblies.items():
        for ref in info["references"]:
            if ref in internal:
                indegree[name] += 1
                dependents[ref].append(name)

    ready = sorted(n for n, d in indegree.items() if d == 0)
    order = []

    while ready:
        current = ready.pop(0)
        order.append(current)
        for dependent in sorted(dependents[current]):
            indegree[dependent] -= 1
            if indegree[dependent] == 0:
                ready.append(dependent)
                ready.sort()

    if len(order) != len(assemblies):
        remaining = sorted(set(assemblies) - set(order))
        raise SystemExit(
            f"{RED}Assembly dependency cycle detected among: {', '.join(remaining)}{RESET}"
        )

    return order


def validate_graph(assemblies):
    """Reports references to assemblies that do not exist and are not Unity-provided."""
    problems = []
    known = set(assemblies) | UNITY_ONLY_REFERENCES
    for name, info in assemblies.items():
        for ref in info["references"]:
            if ref not in known and not ref.startswith("Unity"):
                problems.append(f"{name} references unknown assembly '{ref}'")
    return problems


DIGIT_SEPARATOR = re.compile(r"(?<![A-Za-z_0-9.])\d[\d_]*_\d")


def lint_digit_separators(assemblies):
    """Digit separators in numeric literals are banned in this project.

    The Mono compiler used by this script mis-parses them -- it duplicates the digit
    after each underscore, so `1_000_000` compiles as 100000000. Roslyn (and therefore
    Unity) is correct, which is exactly the danger: the numbers verified here would
    silently differ from the numbers that ship. Plain digits compile identically in
    both, so the project uses plain digits.
    """
    offenders = []
    seen = set()

    sources = []
    for info in assemblies.values():
        sources.extend(info["sources"])

    for path in sorted(set(sources)):
        if path in seen:
            continue
        seen.add(path)
        with open(path) as handle:
            for number, line in enumerate(handle, start=1):
                if DIGIT_SEPARATOR.search(line):
                    offenders.append(f"{os.path.relpath(path, ROOT)}:{number}: {line.strip()}")

    return offenders


def compile_assembly(compiler, name, info, assemblies, extra_sources=None, extra_refs=None):
    os.makedirs(BUILD, exist_ok=True)
    output = os.path.join(BUILD, name + ".dll")

    refs = []
    for ref in info["references"]:
        if ref in assemblies and assemblies[ref]["no_engine"]:
            refs.append("-r:" + os.path.join(BUILD, ref + ".dll"))
    for ref in extra_refs or []:
        refs.append("-r:" + ref)

    sources = list(info["sources"]) + list(extra_sources or [])
    if not sources:
        return True, "no sources"

    command = [compiler, "-langversion:latest", "-nologo", "-target:library",
               "-out:" + output] + refs + sources
    result = subprocess.run(command, capture_output=True, text=True)

    if result.returncode != 0:
        return False, (result.stdout + result.stderr).strip()
    return True, f"{len(sources)} file(s)"


def main():
    compiler, compiler_path = find_compiler()
    if not compiler:
        print(f"{RED}No C# compiler found (looked for mcs, csc, dotnet).{RESET}")
        print("On Debian/Ubuntu:  apt-get install -y mono-devel")
        return 2

    print(f"{DIM}compiler: {compiler_path}{RESET}")
    print()

    assemblies = discover_assemblies()
    if not assemblies:
        print(f"{RED}No .asmdef files found under {ASSETS}{RESET}")
        return 2

    problems = validate_graph(assemblies)
    if problems:
        print(f"{RED}Assembly graph problems:{RESET}")
        for problem in problems:
            print("  " + problem)
        return 1

    separators = lint_digit_separators(assemblies)
    if separators:
        print(f"{RED}Digit separators found in numeric literals (banned -- see Tools/README.md):{RESET}")
        for offender in separators:
            print("  " + offender)
        return 1

    order = topo_sort(assemblies)

    print("Assembly graph (dependency order)")
    print("---------------------------------")
    failures = 0
    pure = []

    engine_dependent = []

    for name in order:
        info = assemblies[name]
        if not info["no_engine"]:
            # Test assemblies need the real Unity test runner; runtime glue can at least be
            # type-checked against the stubs.
            if name.startswith("Prive.Tests"):
                print(f"  {YELLOW}skip{RESET}   {name:<28} {DIM}(tests run below via the shim runner){RESET}")
            else:
                engine_dependent.append(name)
            continue

        ok, detail = compile_assembly(compiler, name, info, assemblies)
        if ok:
            pure.append(name)
            print(f"  {GREEN}ok{RESET}     {name:<28} {DIM}{detail}{RESET}")
        else:
            failures += 1
            print(f"  {RED}FAILED{RESET} {name}")
            print(detail)

    for name in engine_dependent:
        info = assemblies[name]
        ok, detail = compile_assembly(
            compiler, name, info, assemblies,
            extra_sources=[os.path.join(VERIFY_SRC, "UnityStubs.cs")])

        if ok:
            print(f"  {GREEN}ok*{RESET}    {name:<28} {DIM}{detail}, against Unity stubs{RESET}")
        else:
            failures += 1
            print(f"  {RED}FAILED{RESET} {name}")
            print(detail)

    if failures:
        print()
        print(f"{RED}{failures} assembly/assemblies failed to compile.{RESET}")
        return 1

    # --- tests -------------------------------------------------------------
    print()
    print("Core tests")
    print("----------")

    test_dir = os.path.join(ASSETS, "Tests")
    test_sources = []
    for dirpath, _dirnames, filenames in os.walk(test_dir):
        for filename in sorted(filenames):
            if filename.endswith(".cs"):
                test_sources.append(os.path.join(dirpath, filename))

    if not test_sources:
        print(f"  {YELLOW}no test files found{RESET}")
        return 0

    shim_sources = [
        os.path.join(VERIFY_SRC, "NUnitShim.cs"),
        os.path.join(VERIFY_SRC, "TestRunner.cs"),
    ]

    exe = os.path.join(BUILD, "PriveCoreTests.exe")
    refs = ["-r:" + os.path.join(BUILD, name + ".dll") for name in pure]
    command = [compiler, "-langversion:latest", "-nologo", "-target:exe",
               "-out:" + exe] + refs + test_sources + shim_sources

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  {RED}test compilation FAILED{RESET}")
        print((result.stdout + result.stderr).strip())
        return 1

    runner = ["mono", exe] if compiler == "mcs" else [exe]
    run = subprocess.run(runner, capture_output=True, text=True, cwd=BUILD)
    print(run.stdout.rstrip())
    if run.stderr.strip():
        print(run.stderr.rstrip())

    if run.returncode != 0:
        print(f"{RED}Tests failed.{RESET}")
        return 1

    print()
    print(f"{GREEN}VERIFY OK{RESET} — {len(pure)} pure assemblies compiled, all core tests passed.")
    print(f"{DIM}  * engine-dependent assemblies are type-checked against minimal Unity stubs;{RESET}")
    print(f"{DIM}    that is a signature check only and does not replace opening the Editor.{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
