// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ClankonBounty} from "./ClankonBounty.sol";
import {IERC8183Job} from "./interfaces/IERC8183Job.sol";

/// @title ClankonERC8183Adapter — View-only ERC-8183 adapter for ClankonBounty
/// @notice Maps ClankonBounty state to the ERC-8183 job interface.
///         All bounties are exposed including multi-winner (Decision 4: first winner as provider).
///         No lifecycle hooks (Decision 5: view-only, fully 8183-compliant).
contract ClankonERC8183Adapter is IERC8183Job {
    ClankonBounty public immutable bountyContract;

    constructor(address _bountyContract) {
        bountyContract = ClankonBounty(_bountyContract);
    }

    /// @notice Get job details for a bounty, mapped to ERC-8183 format
    /// @dev Status mapping:
    ///   Active (pre-deadline)  → Funded
    ///   Active (post-deadline) → Submitted
    ///   Resolved / Claimed     → Completed
    ///   Cancelled              → Rejected
    function getJob(uint256 jobId) external view override returns (
        address requester,
        address provider,
        address evaluator,
        address token,
        uint256 amount,
        JobStatus status,
        address hook
    ) {
        ClankonBounty.Bounty memory b = bountyContract.getBounty(jobId);

        requester = b.poster;
        token = b.token;
        amount = b.amount;
        evaluator = bountyContract.oracle();
        hook = address(0); // No hooks (Decision 5)

        // Provider: first winner if resolved, otherwise address(0)
        address[] memory winners = bountyContract.getBountyWinners(jobId);
        provider = winners.length > 0 ? winners[0] : address(0);

        // Status mapping
        if (b.status == ClankonBounty.BountyStatus.Cancelled) {
            status = JobStatus.Rejected;
        } else if (b.status == ClankonBounty.BountyStatus.Resolved || b.status == ClankonBounty.BountyStatus.Claimed) {
            status = JobStatus.Completed;
        } else if (b.status == ClankonBounty.BountyStatus.Active && block.timestamp >= b.deadline) {
            status = JobStatus.Submitted;
        } else {
            status = JobStatus.Funded;
        }
    }

    /// @notice Get the total number of jobs (equals total bounties created)
    function getJobCount() external view override returns (uint256) {
        return bountyContract.getBountyCount();
    }
}
