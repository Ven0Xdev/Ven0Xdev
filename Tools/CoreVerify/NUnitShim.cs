// Minimal stand-in for the parts of NUnit that PRIVÉ's core tests use.
//
// The tests in Assets/PRIVE/Tests are real NUnit tests and run in Unity's Test Runner
// against the real NUnit. This shim exists only so the same test files can also be
// compiled and executed outside the Editor by Tools/verify.sh, where no Unity and no
// nunit.framework.dll are available.
//
// It is deliberately tiny. If a test needs an NUnit feature that is not here, add it
// here rather than reaching for a constraint API that would make the shim a project of
// its own.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;

namespace NUnit.Framework
{
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class TestFixtureAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class TestAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class SetUpAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class TearDownAttribute : Attribute { }

    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
    public sealed class TestCaseAttribute : Attribute
    {
        public object[] Arguments { get; private set; }

        public TestCaseAttribute(params object[] arguments)
        {
            Arguments = arguments ?? new object[0];
        }
    }

    [AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
    public sealed class CategoryAttribute : Attribute
    {
        public CategoryAttribute(string name) { }
    }

    public class AssertionException : Exception
    {
        public AssertionException(string message) : base(message) { }
    }

    public static class Assert
    {
        public static void IsTrue(bool condition, string message = null)
        {
            if (!condition) Fail(message ?? "Expected true but was false.");
        }

        public static void IsFalse(bool condition, string message = null)
        {
            if (condition) Fail(message ?? "Expected false but was true.");
        }

        public static void IsNull(object value, string message = null)
        {
            if (value != null) Fail(message ?? "Expected null but was " + Describe(value) + ".");
        }

        public static void IsNotNull(object value, string message = null)
        {
            if (value == null) Fail(message ?? "Expected non-null.");
        }

        public static void AreEqual(object expected, object actual, string message = null)
        {
            if (!ValuesEqual(expected, actual))
            {
                Fail(message ?? "Expected " + Describe(expected) + " but was " + Describe(actual) + ".");
            }
        }

        public static void AreNotEqual(object expected, object actual, string message = null)
        {
            if (ValuesEqual(expected, actual))
            {
                Fail(message ?? "Expected a value other than " + Describe(expected) + ".");
            }
        }

        public static void AreEqual(double expected, double actual, double delta, string message = null)
        {
            if (Math.Abs(expected - actual) > delta)
            {
                Fail(message ?? "Expected " + expected + " ± " + delta + " but was " + actual + ".");
            }
        }

        public static void AreSame(object expected, object actual, string message = null)
        {
            if (!ReferenceEquals(expected, actual)) Fail(message ?? "Expected the same instance.");
        }

        public static void Greater(IComparable left, IComparable right, string message = null)
        {
            if (left.CompareTo(right) <= 0)
            {
                Fail(message ?? "Expected " + Describe(left) + " > " + Describe(right) + ".");
            }
        }

        public static void GreaterOrEqual(IComparable left, IComparable right, string message = null)
        {
            if (left.CompareTo(right) < 0)
            {
                Fail(message ?? "Expected " + Describe(left) + " >= " + Describe(right) + ".");
            }
        }

        public static void Less(IComparable left, IComparable right, string message = null)
        {
            if (left.CompareTo(right) >= 0)
            {
                Fail(message ?? "Expected " + Describe(left) + " < " + Describe(right) + ".");
            }
        }

        public static void LessOrEqual(IComparable left, IComparable right, string message = null)
        {
            if (left.CompareTo(right) > 0)
            {
                Fail(message ?? "Expected " + Describe(left) + " <= " + Describe(right) + ".");
            }
        }

        public static void IsEmpty(ICollection collection, string message = null)
        {
            if (collection == null || collection.Count != 0)
            {
                Fail(message ?? "Expected an empty collection.");
            }
        }

        public static void IsNotEmpty(ICollection collection, string message = null)
        {
            if (collection == null || collection.Count == 0)
            {
                Fail(message ?? "Expected a non-empty collection.");
            }
        }

        public static void IsEmpty(string value, string message = null)
        {
            if (!string.IsNullOrEmpty(value)) Fail(message ?? "Expected an empty string.");
        }

        public static void IsNotEmpty(string value, string message = null)
        {
            if (string.IsNullOrEmpty(value)) Fail(message ?? "Expected a non-empty string.");
        }

        public static void Contains(object expected, ICollection collection, string message = null)
        {
            if (collection != null)
            {
                foreach (object item in collection)
                {
                    if (ValuesEqual(expected, item)) return;
                }
            }

            Fail(message ?? "Expected the collection to contain " + Describe(expected) + ".");
        }

        public static TException Throws<TException>(Action action, string message = null) where TException : Exception
        {
            try
            {
                action();
            }
            catch (TException expected)
            {
                return expected;
            }
            catch (Exception other)
            {
                Fail(message ?? "Expected " + typeof(TException).Name + " but got " + other.GetType().Name + ": " + other.Message);
            }

            Fail(message ?? "Expected " + typeof(TException).Name + " but nothing was thrown.");
            return null;
        }

        public static void DoesNotThrow(Action action, string message = null)
        {
            try
            {
                action();
            }
            catch (Exception e)
            {
                Fail(message ?? "Expected no exception but got " + e.GetType().Name + ": " + e.Message);
            }
        }

        public static void Fail(string message)
        {
            throw new AssertionException(message ?? "Assertion failed.");
        }

        public static void Pass() { }

        private static bool ValuesEqual(object expected, object actual)
        {
            if (expected == null || actual == null) return ReferenceEquals(expected, actual);

            // Numeric literals in tests arrive as int while the value under test may be long,
            // so compare numerics by value rather than by boxed type.
            if (IsIntegral(expected) && IsIntegral(actual))
            {
                return Convert.ToInt64(expected, CultureInfo.InvariantCulture)
                       == Convert.ToInt64(actual, CultureInfo.InvariantCulture);
            }

            return expected.Equals(actual);
        }

        private static bool IsIntegral(object value)
        {
            return value is byte || value is sbyte || value is short || value is ushort
                   || value is int || value is uint || value is long;
        }

        private static string Describe(object value)
        {
            if (value == null) return "null";
            if (value is string) return "\"" + value + "\"";
            return value.ToString();
        }
    }

    /// <summary>Collection assertions used by a handful of tests.</summary>
    public static class CollectionAssert
    {
        public static void IsEmpty(ICollection collection, string message = null)
        {
            Assert.IsEmpty(collection, message);
        }

        public static void IsNotEmpty(ICollection collection, string message = null)
        {
            Assert.IsNotEmpty(collection, message);
        }

        public static void AreEqual(ICollection expected, ICollection actual, string message = null)
        {
            List<object> a = ToList(expected);
            List<object> b = ToList(actual);

            Assert.AreEqual(a.Count, b.Count, message ?? "Collections differ in length.");
            for (int i = 0; i < a.Count; i++)
            {
                Assert.AreEqual(a[i], b[i], message ?? ("Collections differ at index " + i + "."));
            }
        }

        private static List<object> ToList(ICollection collection)
        {
            List<object> list = new List<object>();
            if (collection == null) return list;
            foreach (object item in collection) list.Add(item);
            return list;
        }
    }
}
