using System;

namespace Prive.Core
{
    /// <summary>
    /// Typed, synchronous publish/subscribe. The only sanctioned way for systems that
    /// do not own each other to communicate.
    /// </summary>
    /// <remarks>
    /// Events are <em>notifications of fact</em>, never commands. <c>MoneyChangedEvent</c>
    /// states that money changed; it never asks anyone to change money. Anything that
    /// reads like an instruction belongs on a service interface instead.
    /// </remarks>
    public interface IEventBus
    {
        /// <summary>
        /// Registers <paramref name="handler"/> for events of type <typeparamref name="T"/>.
        /// Dispose the returned token to unsubscribe — safe to call from inside a handler.
        /// </summary>
        IDisposable Subscribe<T>(Action<T> handler);

        /// <summary>Removes a previously registered handler. Ignores handlers that are not subscribed.</summary>
        void Unsubscribe<T>(Action<T> handler);

        /// <summary>Delivers <paramref name="message"/> to every current subscriber, in subscription order.</summary>
        void Publish<T>(T message);

        /// <summary>Number of live handlers for <typeparamref name="T"/>. Diagnostics and tests.</summary>
        int SubscriberCount<T>();
    }

    /// <summary>
    /// Receives exceptions thrown by event handlers. A broken UI widget must never stop
    /// payroll, so the bus isolates failures here instead of aborting a dispatch.
    /// </summary>
    public interface IEventBusErrorSink
    {
        void OnHandlerFailed(Type messageType, Exception exception);
    }
}
