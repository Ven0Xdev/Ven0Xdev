using System;
using UnityEngine;
using Prive.Core;

namespace Prive.Unity
{
    /// <summary>
    /// Routes event-handler failures to the Unity console.
    /// </summary>
    /// <remarks>
    /// The bus swallows handler exceptions so one broken listener cannot abort a dispatch;
    /// this makes sure "swallowed" never means "invisible".
    /// </remarks>
    public sealed class UnityLogErrorSink : IEventBusErrorSink
    {
        public void OnHandlerFailed(Type messageType, Exception exception)
        {
            Debug.LogError("[PRIVE] An event handler for " + messageType.Name + " threw: " + exception.Message);
            Debug.LogException(exception);
        }
    }
}
