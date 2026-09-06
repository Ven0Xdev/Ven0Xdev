using System;
using Prive.World;

namespace Prive.Travel
{
    /// <summary>A pair of cities and the distance between them.</summary>
    public readonly struct TravelRoute
    {
        public readonly WorldLocationId From;
        public readonly WorldLocationId To;

        /// <summary>Great-circle distance in kilometres.</summary>
        public readonly double DistanceKm;

        public TravelRoute(WorldLocationId from, WorldLocationId to, double distanceKm)
        {
            From = from;
            To = to;
            DistanceKm = distanceKm;
        }

        public bool IsSameCity { get { return From == To; } }

        public override string ToString()
        {
            return From + " → " + To + " (" + DistanceKm.ToString("0") + " km)";
        }
    }

    /// <summary>Great-circle distance between two points on the globe.</summary>
    /// <remarks>
    /// Real distances rather than an authored matrix: adding a city means giving it
    /// coordinates, and every route to and from it prices itself correctly with no further
    /// content work.
    /// </remarks>
    public static class GreatCircle
    {
        public const double EarthRadiusKm = 6371.0088;

        public static double DistanceKm(double latitudeADeg, double longitudeADeg,
                                        double latitudeBDeg, double longitudeBDeg)
        {
            double lat1 = ToRadians(latitudeADeg);
            double lat2 = ToRadians(latitudeBDeg);
            double deltaLat = lat2 - lat1;
            double deltaLon = ToRadians(longitudeBDeg - longitudeADeg);

            double sinLat = Math.Sin(deltaLat * 0.5);
            double sinLon = Math.Sin(deltaLon * 0.5);

            double a = (sinLat * sinLat) + (Math.Cos(lat1) * Math.Cos(lat2) * sinLon * sinLon);
            if (a < 0.0) a = 0.0;
            if (a > 1.0) a = 1.0;

            return 2.0 * EarthRadiusKm * Math.Asin(Math.Sqrt(a));
        }

        public static double DistanceKm(CityData a, CityData b)
        {
            if (a == null) throw new ArgumentNullException("a");
            if (b == null) throw new ArgumentNullException("b");

            return DistanceKm(a.LatitudeDeg, a.LongitudeDeg, b.LatitudeDeg, b.LongitudeDeg);
        }

        private static double ToRadians(double degrees) { return degrees * Math.PI / 180.0; }
    }
}
