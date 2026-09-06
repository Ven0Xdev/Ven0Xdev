using System;
using System.Collections.Generic;
using Prive.Core;

namespace Prive.Social
{
    /// <summary>
    /// Blends visible signals into the wealth the world believes the player has.
    /// </summary>
    /// <remarks>
    /// <para>
    /// This is PRIVÉ's signature system. Observed wealth is computed entirely independently
    /// of actual net worth, so the two can — and should — diverge:
    /// </para>
    /// <list type="bullet">
    /// <item><description>$100k net worth, leased supercar and a rented penthouse → observed
    /// $1.5M. Doors open that the balance sheet does not justify.</description></item>
    /// <item><description>$20M net worth, sedan and a plain watch → observed $250k. The
    /// quiet-wealth playstyle, with all the access that costs.</description></item>
    /// </list>
    /// <para>
    /// The blend is a weighted mean pulled part-way toward the single strongest signal.
    /// A pure mean would let one modest item drag down a supercar; taking the peak outright
    /// would make everything but the best item meaningless. Perception works in between —
    /// people anchor on the most conspicuous thing they see, but not completely.
    /// </para>
    /// </remarks>
    public sealed class ObservedWealthCalculator
    {
        /// <summary>How far the blend is pulled from the weighted mean toward the strongest signal.</summary>
        public const double PeakBias = 0.35;

        /// <summary>Minimum confidence a signal needs before it can set the peak.</summary>
        public const double PeakConfidenceThreshold = 0.35;

        /// <summary>Assumed baseline when nothing at all is readable — someone has to look like something.</summary>
        public static readonly Money UnreadableBaseline = Money.FromDollars(12000L);

        /// <summary>Change below this fraction does not publish an event, to stop UI churn.</summary>
        public const double SignificantChangeFraction = 0.02;

        private readonly IEventBus _bus;
        private readonly List<IObservedWealthSignal> _signals = new List<IObservedWealthSignal>();
        private readonly List<ObservedWealthContribution> _lastContributions = new List<ObservedWealthContribution>();

        private Money _current;
        private bool _hasEvaluated;

        public ObservedWealthCalculator(IEventBus bus)
        {
            if (bus == null) throw new ArgumentNullException("bus");
            _bus = bus;
        }

        /// <summary>Most recently evaluated observed wealth.</summary>
        public Money Current { get { return _current; } }

        /// <summary>Contributions from the last evaluation, for debugging and the phone's status screen.</summary>
        public IReadOnlyList<ObservedWealthContribution> LastContributions { get { return _lastContributions; } }

        public int SignalCount { get { return _signals.Count; } }

        public IDisposable RegisterSignal(IObservedWealthSignal signal)
        {
            if (signal == null) throw new ArgumentNullException("signal");
            _signals.Add(signal);
            return new Unregister(() => _signals.Remove(signal));
        }

        /// <summary>
        /// Re-evaluates every signal and publishes <see cref="ObservedWealthChangedEvent"/>
        /// when the result moves materially.
        /// </summary>
        public Money Evaluate(ObservedWealthContext context)
        {
            _lastContributions.Clear();

            double totalWeight = 0.0;
            double weightedSum = 0.0;
            double peak = 0.0;

            for (int i = 0; i < _signals.Count; i++)
            {
                ObservedWealthContribution contribution = _signals[i].Evaluate(context);
                if (!contribution.IsMeaningful) continue;

                _lastContributions.Add(contribution);

                double implied = contribution.ImpliedWealth.ToDouble();
                double weight = contribution.EffectiveWeight;

                totalWeight += weight;
                weightedSum += implied * weight;

                if (contribution.Confidence >= PeakConfidenceThreshold && implied > peak)
                {
                    peak = implied;
                }
            }

            Money previous = _current;
            Money result;

            if (totalWeight <= 0.0)
            {
                result = UnreadableBaseline;
            }
            else
            {
                double mean = weightedSum / totalWeight;
                double blended = mean + ((peak - mean) * PeakBias);
                result = Money.FromDollars(blended < 0.0 ? 0.0 : blended);
            }

            _current = result;

            if (!_hasEvaluated || IsSignificantChange(previous, result))
            {
                _hasEvaluated = true;
                _bus.Publish(new ObservedWealthChangedEvent(previous, result));
            }

            return result;
        }

        private static bool IsSignificantChange(Money previous, Money current)
        {
            if (previous == current) return false;
            if (previous.IsZero) return true;

            double delta = Math.Abs((current - previous).ToDouble());
            return delta / Math.Abs(previous.ToDouble()) >= SignificantChangeFraction;
        }

        private sealed class Unregister : IDisposable
        {
            private Action _action;

            public Unregister(Action action) { _action = action; }

            public void Dispose()
            {
                if (_action == null) return;
                _action();
                _action = null;
            }
        }
    }
}
