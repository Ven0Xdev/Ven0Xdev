namespace Prive.Economy
{
    /// <summary>Where money for a payment comes from.</summary>
    public enum PaymentSource
    {
        /// <summary>Cash only. Street deals, tips, anything off the books.</summary>
        Cash,

        /// <summary>Bank only. Property, businesses, anything requiring a paper trail.</summary>
        Bank,

        /// <summary>Bank first, then cash. The default for ordinary purchases.</summary>
        Any
    }

    /// <summary>
    /// What a transaction was for. Drives ledger filtering, the phone's bank app, and later
    /// the tax and accounting systems.
    /// </summary>
    public enum TransactionCategory
    {
        Other = 0,
        Salary,
        VehiclePurchase,
        VehicleSale,
        VehicleUpkeep,
        PropertyPurchase,
        PropertySale,
        PropertyIncome,
        PropertyUpkeep,
        BusinessPurchase,
        BusinessSale,
        BusinessRevenue,
        BusinessExpense,
        InvestmentBuy,
        InvestmentSell,
        InvestmentIncome,
        LoanPrincipal,
        LoanRepayment,
        LoanInterest,
        Travel,
        Lifestyle,
        Insurance,
        Fine,
        Tax,
        Transfer
    }

    /// <summary>Asset classes that contribute to net worth.</summary>
    public enum AssetCategory
    {
        Vehicle,
        Property,
        Business,
        Investment,
        Collectible
    }

    /// <summary>Liability classes that reduce net worth.</summary>
    public enum LiabilityCategory
    {
        Loan,
        Mortgage,
        CreditCard,
        TaxDue,
        Other
    }

    /// <summary>How often a recurring cashflow is applied.</summary>
    public enum CashflowCadence
    {
        Daily,
        Weekly,
        Monthly
    }
}
