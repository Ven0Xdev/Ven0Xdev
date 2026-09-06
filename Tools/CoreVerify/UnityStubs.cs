// Minimal stand-ins for the small slice of the Unity API that PRIVE's engine-facing
// assembly touches.
//
// PURPOSE AND LIMITS
// ------------------
// This lets Tools/verify.sh type-check Prive.Unity.Runtime outside the Editor, catching
// typos, bad signatures, missing usings and broken references in the glue layer. It is a
// SYNTAX AND SIGNATURE CHECK ONLY.
//
// It proves nothing about runtime behaviour, serialization, execution order, platform
// paths or anything else Unity actually does. Passing this check is not a substitute for
// opening the project in the Editor -- see Tools/README.md.
//
// Add members here only as the glue layer starts using them, and keep the signatures
// identical to Unity's.

namespace UnityEngine
{
    public class Object
    {
        public string name { get; set; }
        public static void Destroy(Object target) { }
        public static void DontDestroyOnLoad(Object target) { }
    }

    public class GameObject : Object
    {
        public bool activeSelf { get { return true; } }
        public void SetActive(bool value) { }
    }

    public class Component : Object
    {
        public GameObject gameObject { get { return null; } }
        public Transform transform { get { return null; } }
    }

    public class Transform : Component
    {
    }

    public class Behaviour : Component
    {
        public bool enabled { get; set; }
    }

    public class MonoBehaviour : Behaviour
    {
    }

    public class ScriptableObject : Object
    {
        public static ScriptableObject CreateInstance(System.Type type) { return null; }
        public static T CreateInstance<T>() where T : ScriptableObject { return null; }
    }

    public static class Debug
    {
        public static bool isDebugBuild { get { return true; } }
        public static void Log(object message) { }
        public static void LogWarning(object message) { }
        public static void LogError(object message) { }
        public static void LogException(System.Exception exception) { }
    }

    public static class Application
    {
        public static string persistentDataPath { get { return "."; } }
        public static string version { get { return "0.0.0"; } }
        public static bool isPlaying { get { return false; } }
    }

    public static class Time
    {
        public static float deltaTime { get { return 0f; } }
        public static float unscaledDeltaTime { get { return 0f; } }
        public static float timeScale { get; set; }
    }

    public static class Mathf
    {
        public const float Epsilon = 1.401298E-45f;
        public static float Clamp01(float value) { return value; }
        public static float Clamp(float value, float min, float max) { return value; }
        public static float Lerp(float a, float b, float t) { return a; }
        public static float Max(float a, float b) { return a > b ? a : b; }
        public static float Min(float a, float b) { return a < b ? a : b; }
    }

    [System.AttributeUsage(System.AttributeTargets.Field)]
    public sealed class SerializeField : System.Attribute { }

    [System.AttributeUsage(System.AttributeTargets.Field)]
    public sealed class HeaderAttribute : PropertyAttribute
    {
        public HeaderAttribute(string header) { }
    }

    [System.AttributeUsage(System.AttributeTargets.Field)]
    public sealed class TooltipAttribute : PropertyAttribute
    {
        public TooltipAttribute(string tooltip) { }
    }

    [System.AttributeUsage(System.AttributeTargets.Field)]
    public sealed class RangeAttribute : PropertyAttribute
    {
        public RangeAttribute(float min, float max) { }
    }

    public abstract class PropertyAttribute : System.Attribute { }

    [System.AttributeUsage(System.AttributeTargets.Class)]
    public sealed class CreateAssetMenuAttribute : System.Attribute
    {
        public string fileName { get; set; }
        public string menuName { get; set; }
        public int order { get; set; }
    }

    [System.AttributeUsage(System.AttributeTargets.Class)]
    public sealed class DefaultExecutionOrder : System.Attribute
    {
        public DefaultExecutionOrder(int order) { }
    }

    [System.AttributeUsage(System.AttributeTargets.Class, AllowMultiple = true)]
    public sealed class RequireComponent : System.Attribute
    {
        public RequireComponent(System.Type requiredComponent) { }
    }

    [System.AttributeUsage(System.AttributeTargets.Class)]
    public sealed class DisallowMultipleComponent : System.Attribute { }
}
