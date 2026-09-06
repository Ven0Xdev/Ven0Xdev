using System;
using System.Collections.Generic;

namespace Prive.Core
{
    /// <summary>
    /// Default <see cref="IEventBus"/>: synchronous, reentrancy-safe and
    /// allocation-conscious.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Handlers are stored per closed generic type, so publishing costs one dictionary
    /// lookup and a loop — no LINQ, no reflection, no boxing of struct messages.
    /// </para>
    /// <para>
    /// Dispatch iterates a snapshot taken from a pooled buffer, so a handler may safely
    /// subscribe, unsubscribe or publish while it is being invoked. Without this,
    /// "NPC reacts to arrival by subscribing to arrivals" would corrupt iteration.
    /// </para>
    /// </remarks>
    public sealed class EventBus : IEventBus
    {
        private readonly Dictionary<Type, IHandlerList> _handlers = new Dictionary<Type, IHandlerList>();
        private readonly IEventBusErrorSink _errorSink;

        public EventBus(IEventBusErrorSink errorSink = null)
        {
            _errorSink = errorSink;
        }

        public IDisposable Subscribe<T>(Action<T> handler)
        {
            if (handler == null) throw new ArgumentNullException("handler");
            GetOrCreate<T>().Add(handler);
            return new Subscription<T>(this, handler);
        }

        public void Unsubscribe<T>(Action<T> handler)
        {
            if (handler == null) return;

            IHandlerList list;
            if (_handlers.TryGetValue(typeof(T), out list))
            {
                ((HandlerList<T>)list).Remove(handler);
            }
        }

        public void Publish<T>(T message)
        {
            IHandlerList list;
            if (!_handlers.TryGetValue(typeof(T), out list)) return;

            ((HandlerList<T>)list).Invoke(message, _errorSink);
        }

        public int SubscriberCount<T>()
        {
            IHandlerList list;
            return _handlers.TryGetValue(typeof(T), out list) ? ((HandlerList<T>)list).Count : 0;
        }

        /// <summary>Drops every subscription. Used when tearing down a session.</summary>
        public void Clear()
        {
            _handlers.Clear();
        }

        private HandlerList<T> GetOrCreate<T>()
        {
            IHandlerList list;
            if (!_handlers.TryGetValue(typeof(T), out list))
            {
                list = new HandlerList<T>();
                _handlers[typeof(T)] = list;
            }
            return (HandlerList<T>)list;
        }

        private interface IHandlerList
        {
        }

        private sealed class HandlerList<T> : IHandlerList
        {
            private readonly List<Action<T>> _live = new List<Action<T>>();
            private readonly Stack<List<Action<T>>> _bufferPool = new Stack<List<Action<T>>>();

            /// <summary>Bumped on every add/remove so dispatch can detect mid-flight changes cheaply.</summary>
            private int _version;

            public int Count { get { return _live.Count; } }

            public void Add(Action<T> handler)
            {
                _live.Add(handler);
                _version++;
            }

            public void Remove(Action<T> handler)
            {
                if (_live.Remove(handler)) _version++;
            }

            public void Invoke(T message, IEventBusErrorSink errorSink)
            {
                if (_live.Count == 0) return;

                List<Action<T>> buffer = _bufferPool.Count > 0 ? _bufferPool.Pop() : new List<Action<T>>();
                buffer.AddRange(_live);
                int versionAtSnapshot = _version;

                try
                {
                    for (int i = 0; i < buffer.Count; i++)
                    {
                        Action<T> handler = buffer[i];

                        // Only pay for the membership check once someone has actually
                        // subscribed or unsubscribed during this dispatch. A handler that
                        // was disposed mid-flight (a despawning NPC, a closed UI screen)
                        // must not still be called.
                        if (versionAtSnapshot != _version && !_live.Contains(handler)) continue;

                        try
                        {
                            handler(message);
                        }
                        catch (Exception e)
                        {
                            if (errorSink != null) errorSink.OnHandlerFailed(typeof(T), e);
                            else throw;
                        }
                    }
                }
                finally
                {
                    buffer.Clear();
                    _bufferPool.Push(buffer);
                }
            }
        }

        private sealed class Subscription<T> : IDisposable
        {
            private EventBus _bus;
            private Action<T> _handler;

            public Subscription(EventBus bus, Action<T> handler)
            {
                _bus = bus;
                _handler = handler;
            }

            public void Dispose()
            {
                if (_bus == null) return;
                _bus.Unsubscribe(_handler);
                _bus = null;
                _handler = null;
            }
        }
    }
}
