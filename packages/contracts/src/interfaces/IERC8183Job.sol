// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8183Job — Minimal ERC-8183 job view interface
/// @notice Defines the standard view functions for querying job/bounty state.
///         See https://eips.ethereum.org/EIPS/eip-8183
interface IERC8183Job {
    /// @notice Job status enum matching the ERC-8183 specification
    enum JobStatus {
        Funded,     // Job created and funded, waiting for provider
        Submitted,  // Provider has submitted work, awaiting evaluation
        Completed,  // Job completed and evaluated
        Rejected    // Job cancelled or rejected
    }

    /// @notice Get the details of a specific job
    /// @param jobId The unique identifier for the job
    /// @return requester Address that created/funded the job
    /// @return provider Address assigned to do the work (address(0) if unassigned)
    /// @return evaluator Address that evaluates the work
    /// @return token Payment token address
    /// @return amount Payment amount in token's smallest unit
    /// @return status Current job status
    /// @return hook Lifecycle hook address (address(0) if no hooks)
    function getJob(uint256 jobId) external view returns (
        address requester,
        address provider,
        address evaluator,
        address token,
        uint256 amount,
        JobStatus status,
        address hook
    );

    /// @notice Get the total number of jobs
    function getJobCount() external view returns (uint256);
}
