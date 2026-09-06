using Prive.Core;
using Prive.Social;

namespace Prive.Vehicles
{
    /// <summary>
    /// Reports the vehicle the player is <em>currently using</em> to the observed-wealth blend.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Only the active vehicle contributes. A garage full of supercars raises net worth and
    /// nothing else — nobody on the street can see into a garage. Drive one out and it becomes
    /// the loudest thing about the player.
    /// </para>
    /// <para>
    /// This is the divergence the whole social layer is built on. A player can be worth $20M
    /// and read as ordinary by driving a sedan, or be worth very little and read as wealthy in
    /// a leased supercar. Both are legitimate strategies, and both fall out of this class
    /// evaluating exactly one vehicle.
    /// </para>
    /// </remarks>
    public sealed class ActiveVehicleWealthSignal : IObservedWealthSignal
    {
        /// <summary>How much a vehicle matters socially relative to other signals.</summary>
        public const double SignalWeight = 1.6;

        /// <summary>
        /// Multiplier applied to market value to get implied wealth. People read a car as
        /// evidence of far more money than the car itself costs.
        /// </summary>
        public const double ImpliedWealthMultiple = 6.0;

        /// <summary>Confidence floor: even an anonymous car says the driver can afford a car.</summary>
        public const double MinimumConfidence = 0.2;

        private readonly VehicleOwnershipService _ownership;
        private readonly IVehicleCatalog _catalog;

        public ActiveVehicleWealthSignal(VehicleOwnershipService ownership, IVehicleCatalog catalog)
        {
            _ownership = ownership;
            _catalog = catalog;
        }

        public WealthSignalKind Kind { get { return WealthSignalKind.Vehicle; } }

        public ObservedWealthContribution Evaluate(ObservedWealthContext context)
        {
            VehicleInstance active = _ownership.ActiveVehicle;
            if (active == null)
            {
                // On foot: this signal has nothing to say, and must not drag the blend down.
                return new ObservedWealthContribution(Kind, Money.Zero, 0.0, 0.0);
            }

            VehicleDefinition definition = _catalog.Get(active.DefinitionId);
            if (definition == null)
            {
                return new ObservedWealthContribution(Kind, Money.Zero, 0.0, 0.0);
            }

            Money value = _ownership.ValueOf(active.Id);
            if (!value.IsPositive)
            {
                return new ObservedWealthContribution(Kind, Money.Zero, 0.0, 0.0);
            }

            Money implied = value.Scale(ImpliedWealthMultiple);

            // A recognisable, well-kept car reads clearly; a shabby anonymous one barely
            // registers even if it was expensive once.
            double confidence = MinimumConfidence
                                + ((1.0 - MinimumConfidence)
                                   * VehiclePrestige.Recognisability(definition)
                                   * active.Condition.Value);

            return new ObservedWealthContribution(Kind, implied, SignalWeight, confidence);
        }
    }
}
