// Reflection-based runner for the NUnit-attributed core tests, used by Tools/verify.sh.
// Unity's Test Runner does this job in the Editor; this exists so the same tests can be
// run in CI and from a plain shell with no Unity installed.

using System;
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;

namespace Prive.Verify
{
    public static class TestRunner
    {
        private sealed class Failure
        {
            public string Fixture;
            public string Test;
            public string Message;
            public string Stack;
        }

        public static int Main(string[] args)
        {
            Assembly assembly = typeof(TestRunner).Assembly;

            int passed = 0;
            int failed = 0;
            List<Failure> failures = new List<Failure>();

            Type[] types = assembly.GetTypes();
            Array.Sort(types, (a, b) => string.CompareOrdinal(a.FullName, b.FullName));

            foreach (Type type in types)
            {
                if (type.GetCustomAttributes(typeof(TestFixtureAttribute), false).Length == 0) continue;

                MethodInfo[] methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance);
                Array.Sort(methods, (a, b) => string.CompareOrdinal(a.Name, b.Name));

                MethodInfo setUp = FindMethodWith(methods, typeof(SetUpAttribute));
                MethodInfo tearDown = FindMethodWith(methods, typeof(TearDownAttribute));

                int fixturePassed = 0;
                int fixtureFailed = 0;

                foreach (MethodInfo method in methods)
                {
                    bool isTest = method.GetCustomAttributes(typeof(TestAttribute), false).Length > 0;
                    object[] cases = method.GetCustomAttributes(typeof(TestCaseAttribute), false);

                    if (!isTest && cases.Length == 0) continue;

                    List<object[]> invocations = new List<object[]>();
                    foreach (object attribute in cases)
                    {
                        invocations.Add(((TestCaseAttribute)attribute).Arguments);
                    }
                    if (isTest && invocations.Count == 0) invocations.Add(new object[0]);

                    foreach (object[] arguments in invocations)
                    {
                        string label = method.Name;
                        if (arguments.Length > 0) label += "(" + string.Join(", ", Describe(arguments)) + ")";

                        try
                        {
                            object instance = Activator.CreateInstance(type);
                            if (setUp != null) setUp.Invoke(instance, null);

                            try
                            {
                                method.Invoke(instance, arguments);
                            }
                            finally
                            {
                                if (tearDown != null) tearDown.Invoke(instance, null);
                            }

                            passed++;
                            fixturePassed++;
                        }
                        catch (Exception e)
                        {
                            Exception actual = e is TargetInvocationException && e.InnerException != null
                                ? e.InnerException
                                : e;

                            failed++;
                            fixtureFailed++;
                            failures.Add(new Failure
                            {
                                Fixture = type.FullName,
                                Test = label,
                                Message = actual.Message,
                                Stack = actual.StackTrace
                            });
                        }
                    }
                }

                if (fixturePassed + fixtureFailed > 0)
                {
                    Console.WriteLine(string.Format("  {0,-52} {1,3} passed{2}",
                        ShortName(type), fixturePassed,
                        fixtureFailed > 0 ? ", " + fixtureFailed + " FAILED" : ""));
                }
            }

            Console.WriteLine();

            if (failures.Count > 0)
            {
                Console.WriteLine("FAILURES");
                Console.WriteLine("--------");
                foreach (Failure failure in failures)
                {
                    Console.WriteLine("  " + ShortName(failure.Fixture) + "." + failure.Test);
                    Console.WriteLine("      " + failure.Message);
                    if (!string.IsNullOrEmpty(failure.Stack))
                    {
                        Console.WriteLine("      " + FirstLine(failure.Stack));
                    }
                    Console.WriteLine();
                }
            }

            Console.WriteLine(failed == 0
                ? "RESULT: all " + passed + " tests passed"
                : "RESULT: " + passed + " passed, " + failed + " FAILED");

            return failed == 0 ? 0 : 1;
        }

        private static MethodInfo FindMethodWith(MethodInfo[] methods, Type attributeType)
        {
            foreach (MethodInfo method in methods)
            {
                if (method.GetCustomAttributes(attributeType, false).Length > 0) return method;
            }
            return null;
        }

        private static string[] Describe(object[] arguments)
        {
            string[] described = new string[arguments.Length];
            for (int i = 0; i < arguments.Length; i++)
            {
                described[i] = arguments[i] == null ? "null" : arguments[i].ToString();
            }
            return described;
        }

        private static string ShortName(Type type) { return ShortName(type.FullName); }

        private static string ShortName(string fullName)
        {
            int lastDot = fullName.LastIndexOf('.');
            return lastDot >= 0 ? fullName.Substring(lastDot + 1) : fullName;
        }

        private static string FirstLine(string text)
        {
            int newline = text.IndexOf('\n');
            return newline >= 0 ? text.Substring(0, newline).Trim() : text.Trim();
        }
    }
}
