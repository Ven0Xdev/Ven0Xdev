using System;
using Prive.Core;
using Prive.Save;

namespace Prive.Social
{
    /// <summary>
    /// The player's standing in the world: fame, reputation, influence and lifestyle.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Money is only half of PRIVÉ. These four values are the other half, and they move on
    /// different timescales: fame spikes and fades, reputation moves slowly and is hard to
    /// repair, influence accumulates, lifestyle reflects sustained spending.
    /// </para>
    /// <para>
    /// Decay is applied on clock boundaries via <see cref="SocialStatusDecay"/>, so a player
    /// who stops appearing in public gradually stops being recognised.
    /// </para>
    /// </remarks>
    public sealed class SocialStatus : ISaveable
    {
        public const string SaveNodeKey = "social_status";

        public const double MaxFame = 1000.0;
        public const double MaxInfluence = 1000.0;
        public const double MaxLifestyle = 1000.0;
        public const double MinReputation = -100.0;
        public const double MaxReputation = 100.0;

        private readonly IEventBus _bus;

        private double _fame;
        private double _reputation;
        private double _influence;
        private double _lifestyleScore;

        public SocialStatus(IEventBus bus)
        {
            if (bus == null) throw new ArgumentNullException("bus");
            _bus = bus;
        }

        /// <summary>0–1000. How widely the player is recognised.</summary>
        public double Fame { get { return _fame; } }

        /// <summary>−100–+100. Whether being recognised is a good thing.</summary>
        public double Reputation { get { return _reputation; } }

        /// <summary>0–1000. Doors the player can open. Does not decay.</summary>
        public double Influence { get { return _influence; } }

        /// <summary>0–1000. Sustained visible living standard.</summary>
        public double LifestyleScore { get { return _lifestyleScore; } }

        /// <summary>Derived standing, from fame, reputation and lifestyle.</summary>
        public SocialClass Class
        {
            get { return ClassifyFrom(_fame, _reputation, _lifestyleScore); }
        }

        public void AddFame(double amount) { SetFame(_fame + amount); }
        public void AddReputation(double amount) { SetReputation(_reputation + amount); }
        public void AddInfluence(double amount) { SetInfluence(_influence + amount); }
        public void AddLifestyle(double amount) { SetLifestyle(_lifestyleScore + amount); }

        public void SetFame(double value) { Apply(Clamp(value, 0.0, MaxFame), _reputation, _influence, _lifestyleScore); }
        public void SetReputation(double value) { Apply(_fame, Clamp(value, MinReputation, MaxReputation), _influence, _lifestyleScore); }
        public void SetInfluence(double value) { Apply(_fame, _reputation, Clamp(value, 0.0, MaxInfluence), _lifestyleScore); }
        public void SetLifestyle(double value) { Apply(_fame, _reputation, _influence, Clamp(value, 0.0, MaxLifestyle)); }

        private void Apply(double fame, double reputation, double influence, double lifestyle)
        {
            bool changed = fame != _fame || reputation != _reputation
                           || influence != _influence || lifestyle != _lifestyleScore;

            if (!changed) return;

            SocialClass previousClass = Class;

            _fame = fame;
            _reputation = reputation;
            _influence = influence;
            _lifestyleScore = lifestyle;

            _bus.Publish(new SocialStatusChangedEvent(this));

            SocialClass newClass = Class;
            if (newClass != previousClass)
            {
                _bus.Publish(new SocialClassChangedEvent(previousClass, newClass));
            }
        }

        private static SocialClass ClassifyFrom(double fame, double reputation, double lifestyle)
        {
            // Lifestyle carries most of the weight — sustained visible living standard is
            // what people read. Fame amplifies it; a bad reputation drags it down.
            double score = (lifestyle * 0.6) + (fame * 0.4) + (reputation * 1.5);

            if (score >= 900.0) return SocialClass.Icon;
            if (score >= 700.0) return SocialClass.Elite;
            if (score >= 500.0) return SocialClass.Wealthy;
            if (score >= 340.0) return SocialClass.Affluent;
            if (score >= 200.0) return SocialClass.UpperMiddle;
            if (score >= 80.0) return SocialClass.MiddleClass;
            if (score > 0.0) return SocialClass.Working;
            return SocialClass.Unknown;
        }

        private static double Clamp(double value, double min, double max)
        {
            if (double.IsNaN(value)) return min;
            return value < min ? min : (value > max ? max : value);
        }

        // --- Persistence --------------------------------------------------------

        public string SaveKey { get { return SaveNodeKey; } }

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("fame", _fame);
            node.Set("reputation", _reputation);
            node.Set("influence", _influence);
            node.Set("lifestyle", _lifestyleScore);
            return node;
        }

        public void Restore(SaveNode node)
        {
            if (node == null) return;

            Apply(Clamp(node.GetDouble("fame"), 0.0, MaxFame),
                  Clamp(node.GetDouble("reputation"), MinReputation, MaxReputation),
                  Clamp(node.GetDouble("influence"), 0.0, MaxInfluence),
                  Clamp(node.GetDouble("lifestyle"), 0.0, MaxLifestyle));
        }

        public override string ToString()
        {
            return "Fame " + _fame.ToString("0") +
                   " / Rep " + _reputation.ToString("0") +
                   " / Infl " + _influence.ToString("0") +
                   " / Lifestyle " + _lifestyleScore.ToString("0") +
                   " (" + Class + ")";
        }
    }

    /// <summary>
    /// Applies fame and lifestyle decay on the clock.
    /// </summary>
    /// <remarks>
    /// Separated from <see cref="SocialStatus"/> so the status object stays a pure state
    /// container that tests can drive directly without a clock.
    /// </remarks>
    public sealed class SocialStatusDecay : ClockTickable
    {
        /// <summary>Fraction of fame lost each week with no new exposure.</summary>
        public const double WeeklyFameDecay = 0.06;

        /// <summary>Fraction of lifestyle score lost each month without sustained spending.</summary>
        public const double MonthlyLifestyleDecay = 0.04;

        /// <summary>Reputation drifts back toward neutral very slowly.</summary>
        public const double MonthlyReputationDriftToNeutral = 0.02;

        private readonly SocialStatus _status;

        public SocialStatusDecay(SocialStatus status)
        {
            if (status == null) throw new ArgumentNullException("status");
            _status = status;
        }

        public override void OnWeek(GameTime now)
        {
            _status.SetFame(_status.Fame * (1.0 - WeeklyFameDecay));
        }

        public override void OnMonth(GameTime now)
        {
            _status.SetLifestyle(_status.LifestyleScore * (1.0 - MonthlyLifestyleDecay));
            _status.SetReputation(_status.Reputation * (1.0 - MonthlyReputationDriftToNeutral));
        }
    }
}
