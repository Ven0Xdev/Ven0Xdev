namespace Prive.Core
{
    /// <summary>Why an operation could not be performed.</summary>
    /// <remarks>
    /// A player trying to buy a car they cannot afford is an expected outcome, not an
    /// exceptional one. Codes let UI localise the message without string matching.
    /// </remarks>
    public enum FailureReason
    {
        None = 0,
        InsufficientFunds,
        NotFound,
        NotOwned,
        AlreadyOwned,
        NotUnlocked,
        RequirementNotMet,
        InvalidArgument,
        InvalidState,
        AtCapacity,
        Cancelled
    }

    /// <summary>Result of an operation that returns nothing but can fail for expected reasons.</summary>
    public readonly struct OperationResult
    {
        public readonly bool IsSuccess;
        public readonly FailureReason Reason;
        public readonly string Message;

        private OperationResult(bool success, FailureReason reason, string message)
        {
            IsSuccess = success;
            Reason = reason;
            Message = message;
        }

        public bool IsFailure { get { return !IsSuccess; } }

        public static OperationResult Success()
        {
            return new OperationResult(true, FailureReason.None, null);
        }

        public static OperationResult Failure(FailureReason reason, string message = null)
        {
            return new OperationResult(false, reason, message);
        }

        public override string ToString()
        {
            return IsSuccess ? "Success" : "Failure(" + Reason + "): " + (Message ?? "");
        }
    }

    /// <summary>Result of an operation that produces a value but can fail for expected reasons.</summary>
    public readonly struct OperationResult<T>
    {
        public readonly bool IsSuccess;
        public readonly T Value;
        public readonly FailureReason Reason;
        public readonly string Message;

        private OperationResult(bool success, T value, FailureReason reason, string message)
        {
            IsSuccess = success;
            Value = value;
            Reason = reason;
            Message = message;
        }

        public bool IsFailure { get { return !IsSuccess; } }

        public static OperationResult<T> Success(T value)
        {
            return new OperationResult<T>(true, value, FailureReason.None, null);
        }

        public static OperationResult<T> Failure(FailureReason reason, string message = null)
        {
            return new OperationResult<T>(false, default(T), reason, message);
        }

        public override string ToString()
        {
            return IsSuccess ? "Success(" + Value + ")" : "Failure(" + Reason + "): " + (Message ?? "");
        }
    }
}
