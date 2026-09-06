using System;

namespace Prive.Vehicles
{
    /// <summary>
    /// Mechanical and cosmetic condition, as a value in 0–1.
    /// </summary>
    /// <remarks>
    /// A continuous number rather than a grade, because valuation needs fine resolution — the
    /// difference between 0.82 and 0.78 is real money on a supercar. <see cref="Grade"/>
    /// exists only for UI and dealership dialogue.
    /// </remarks>
    public readonly struct VehicleCondition : IEquatable<VehicleCondition>, IComparable<VehicleCondition>
    {
        public static readonly VehicleCondition Pristine = new VehicleCondition(1.0);
        public static readonly VehicleCondition Salvage = new VehicleCondition(0.0);

        private readonly double _value;

        public VehicleCondition(double value)
        {
            _value = Clamp01(value);
        }

        /// <summary>0 (scrap) to 1 (as new).</summary>
        public double Value { get { return _value; } }

        public VehicleConditionGrade Grade
        {
            get
            {
                if (_value >= 0.95) return VehicleConditionGrade.Pristine;
                if (_value >= 0.82) return VehicleConditionGrade.Excellent;
                if (_value >= 0.62) return VehicleConditionGrade.Good;
                if (_value >= 0.40) return VehicleConditionGrade.Fair;
                if (_value >= 0.18) return VehicleConditionGrade.Poor;
                return VehicleConditionGrade.Salvage;
            }
        }

        /// <summary>Applies wear, never dropping below zero.</summary>
        public VehicleCondition Worn(double amount)
        {
            return new VehicleCondition(_value - Math.Abs(amount));
        }

        /// <summary>Applies repair, never exceeding as-new.</summary>
        public VehicleCondition Repaired(double amount)
        {
            return new VehicleCondition(_value + Math.Abs(amount));
        }

        private static double Clamp01(double value)
        {
            if (double.IsNaN(value)) return 0.0;
            return value < 0.0 ? 0.0 : (value > 1.0 ? 1.0 : value);
        }

        public bool Equals(VehicleCondition other) { return _value.Equals(other._value); }
        public override bool Equals(object obj) { return obj is VehicleCondition && Equals((VehicleCondition)obj); }
        public override int GetHashCode() { return _value.GetHashCode(); }
        public int CompareTo(VehicleCondition other) { return _value.CompareTo(other._value); }

        public override string ToString()
        {
            return Grade + " (" + (_value * 100.0).ToString("0") + "%)";
        }
    }
}
