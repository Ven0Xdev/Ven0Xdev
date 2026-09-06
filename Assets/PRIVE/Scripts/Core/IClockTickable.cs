namespace Prive.Core
{
    /// <summary>
    /// Implemented by simulation systems that must tick in a <em>deterministic order</em>
    /// — loan interest after revenue, valuation after both.
    /// </summary>
    /// <remarks>
    /// PRIVÉ has two ways to react to time and they are not interchangeable:
    /// <list type="bullet">
    /// <item><description><b>This interface</b> — registered explicitly with
    /// <see cref="IGameClock"/>, invoked in registration order. Use it for anything whose
    /// result depends on running before or after another system.</description></item>
    /// <item><description><b>Tick events on <see cref="IEventBus"/></b> — unordered, loosely
    /// coupled. Use them for UI, audio, analytics and anything order-independent.</description></item>
    /// </list>
    /// Deriving from <see cref="ClockTickable"/> saves implementing the methods you ignore.
    /// </remarks>
    public interface IClockTickable
    {
        void OnMinute(GameTime now);
        void OnHour(GameTime now);
        void OnDay(GameTime now);
        void OnWeek(GameTime now);
        void OnMonth(GameTime now);
        void OnYear(GameTime now);
    }

    /// <summary>No-op base so implementers override only the cadences they care about.</summary>
    public abstract class ClockTickable : IClockTickable
    {
        public virtual void OnMinute(GameTime now) { }
        public virtual void OnHour(GameTime now) { }
        public virtual void OnDay(GameTime now) { }
        public virtual void OnWeek(GameTime now) { }
        public virtual void OnMonth(GameTime now) { }
        public virtual void OnYear(GameTime now) { }
    }
}
