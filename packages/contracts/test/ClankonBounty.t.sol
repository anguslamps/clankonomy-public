// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ClankonBounty} from "../src/ClankonBounty.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ClankonBountyTest is Test {
    ClankonBounty public bounty;
    MockUSDC public usdc;

    address owner = makeAddr("owner");
    address oracle = makeAddr("oracle");
    address poster = makeAddr("poster");
    address solver1 = makeAddr("solver1");
    address solver2 = makeAddr("solver2");
    address solver3 = makeAddr("solver3");

    uint256 constant BOUNTY_AMOUNT = 1000e6; // 1000 USDC
    bytes32 constant EVAL_HASH = keccak256("eval_script_v1");
    string constant METADATA_URI = "ipfs://QmExample";

    function setUp() public {
        usdc = new MockUSDC();
        bounty = new ClankonBounty(oracle, owner);

        vm.prank(owner);
        bounty.setAllowedToken(address(usdc), true);

        usdc.mint(poster, 10_000e6);
        vm.prank(poster);
        usdc.approve(address(bounty), type(uint256).max);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    function _singleWinnerShares() internal pure returns (uint16[] memory) {
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10000;
        return shares;
    }

    function _twoWinnerShares() internal pure returns (uint16[] memory) {
        uint16[] memory shares = new uint16[](2);
        shares[0] = 7000;
        shares[1] = 3000;
        return shares;
    }

    function _threeWinnerShares() internal pure returns (uint16[] memory) {
        uint16[] memory shares = new uint16[](3);
        shares[0] = 6000;
        shares[1] = 3000;
        shares[2] = 1000;
        return shares;
    }

    uint16 constant DEFAULT_FEE_BPS = 250; // Sonnet tier (2.5%)

    function _createSingleWinnerBounty() internal returns (uint256) {
        return _createSingleWinnerBountyWithFee(DEFAULT_FEE_BPS);
    }

    function _createSingleWinnerBountyWithFee(uint16 feeBps) internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 days;
        vm.prank(poster);
        return bounty.createBounty(
            address(usdc), BOUNTY_AMOUNT, deadline, EVAL_HASH, METADATA_URI, 1, _singleWinnerShares(), feeBps
        );
    }

    function _createMultiWinnerBounty(uint8 numWinners, uint16[] memory shares) internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 days;
        vm.prank(poster);
        return bounty.createBounty(address(usdc), BOUNTY_AMOUNT, deadline, EVAL_HASH, METADATA_URI, numWinners, shares, DEFAULT_FEE_BPS);
    }

    function _singleWinnerArray(address w) internal pure returns (address[] memory) {
        address[] memory winners = new address[](1);
        winners[0] = w;
        return winners;
    }

    function _singleScoreArray(uint256 s) internal pure returns (uint256[] memory) {
        uint256[] memory scores = new uint256[](1);
        scores[0] = s;
        return scores;
    }

    function _twoRevealShares() internal pure returns (uint16[] memory) {
        uint16[] memory shares = new uint16[](2);
        shares[0] = 6667;
        shares[1] = 3333;
        return shares;
    }

    // ─── Creation ───────────────────────────────────────────────────────────────

    function test_createBounty_singleWinner() public {
        uint256 deadline = block.timestamp + 1 days;

        vm.prank(poster);
        uint256 bountyId = bounty.createBounty(
            address(usdc), BOUNTY_AMOUNT, deadline, EVAL_HASH, METADATA_URI, 1, _singleWinnerShares(), DEFAULT_FEE_BPS
        );

        assertEq(bountyId, 0);
        assertEq(usdc.balanceOf(address(bounty)), BOUNTY_AMOUNT);
        assertEq(usdc.balanceOf(poster), 10_000e6 - BOUNTY_AMOUNT);

        ClankonBounty.Bounty memory b = bounty.getBounty(0);
        assertEq(b.poster, poster);
        assertEq(b.token, address(usdc));
        assertEq(b.amount, BOUNTY_AMOUNT);
        assertEq(b.deadline, deadline);
        assertEq(b.evalHash, EVAL_HASH);
        assertEq(b.metadataURI, METADATA_URI);
        assertEq(b.numWinners, 1);
        assertEq(uint8(b.status), uint8(ClankonBounty.BountyStatus.Active));

        uint16[] memory shares = bounty.getBountyShares(0);
        assertEq(shares.length, 1);
        assertEq(shares[0], 10000);
    }

    function test_createBounty_multiWinner() public {
        uint256 deadline = block.timestamp + 1 days;
        uint16[] memory shares = _threeWinnerShares();

        vm.prank(poster);
        uint256 bountyId = bounty.createBounty(
            address(usdc), BOUNTY_AMOUNT, deadline, EVAL_HASH, METADATA_URI, 3, shares, DEFAULT_FEE_BPS
        );

        ClankonBounty.Bounty memory b = bounty.getBounty(bountyId);
        assertEq(b.numWinners, 3);

        uint16[] memory storedShares = bounty.getBountyShares(bountyId);
        assertEq(storedShares.length, 3);
        assertEq(storedShares[0], 6000);
        assertEq(storedShares[1], 3000);
        assertEq(storedShares[2], 1000);
    }

    function test_createBounty_reverts_tokenNotAllowed() public {
        MockUSDC badToken = new MockUSDC();

        vm.prank(poster);
        vm.expectRevert(ClankonBounty.TokenNotAllowed.selector);
        bounty.createBounty(
            address(badToken), BOUNTY_AMOUNT, block.timestamp + 1 days, EVAL_HASH, METADATA_URI, 1, _singleWinnerShares(), DEFAULT_FEE_BPS
        );
    }

    function test_createBounty_reverts_deadlineTooSoon() public {
        vm.prank(poster);
        vm.expectRevert(ClankonBounty.DeadlineTooSoon.selector);
        bounty.createBounty(
            address(usdc), BOUNTY_AMOUNT, block.timestamp + 30 minutes, EVAL_HASH, METADATA_URI, 1, _singleWinnerShares(), DEFAULT_FEE_BPS
        );
    }

    function test_createBounty_reverts_amountZero() public {
        vm.prank(poster);
        vm.expectRevert(ClankonBounty.AmountZero.selector);
        bounty.createBounty(address(usdc), 0, block.timestamp + 1 days, EVAL_HASH, METADATA_URI, 1, _singleWinnerShares(), DEFAULT_FEE_BPS);
    }

    function test_createBounty_reverts_invalidPayoutConfig_zeroWinners() public {
        uint16[] memory shares = new uint16[](0);

        vm.prank(poster);
        vm.expectRevert(ClankonBounty.InvalidPayoutConfig.selector);
        bounty.createBounty(address(usdc), BOUNTY_AMOUNT, block.timestamp + 1 days, EVAL_HASH, METADATA_URI, 0, shares, DEFAULT_FEE_BPS);
    }

    function test_createBounty_reverts_invalidPayoutConfig_tooManyWinners() public {
        uint16[] memory shares = new uint16[](4);
        shares[0] = 4000;
        shares[1] = 3000;
        shares[2] = 2000;
        shares[3] = 1000;

        vm.prank(poster);
        vm.expectRevert(ClankonBounty.InvalidPayoutConfig.selector);
        bounty.createBounty(address(usdc), BOUNTY_AMOUNT, block.timestamp + 1 days, EVAL_HASH, METADATA_URI, 4, shares, DEFAULT_FEE_BPS);
    }

    function test_createBounty_reverts_sharesMismatch() public {
        uint16[] memory shares = new uint16[](2);
        shares[0] = 7000;
        shares[1] = 3000;

        vm.prank(poster);
        vm.expectRevert(ClankonBounty.InvalidPayoutConfig.selector);
        bounty.createBounty(address(usdc), BOUNTY_AMOUNT, block.timestamp + 1 days, EVAL_HASH, METADATA_URI, 1, shares, DEFAULT_FEE_BPS);
    }

    function test_createBounty_reverts_sharesNotSumTo10000() public {
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5000;
        shares[1] = 4000; // sum = 9000

        vm.prank(poster);
        vm.expectRevert(ClankonBounty.SharesMustSumTo10000.selector);
        bounty.createBounty(address(usdc), BOUNTY_AMOUNT, block.timestamp + 1 days, EVAL_HASH, METADATA_URI, 2, shares, DEFAULT_FEE_BPS);
    }

    function test_createBounty_reverts_deadlineTooFar() public {
        vm.prank(poster);
        vm.expectRevert(ClankonBounty.DeadlineTooFar.selector);
        bounty.createBounty(
            address(usdc), BOUNTY_AMOUNT, block.timestamp + 91 days, EVAL_HASH, METADATA_URI, 1, _singleWinnerShares(), DEFAULT_FEE_BPS
        );
    }

    // ─── Winner Reporting ───────────────────────────────────────────────────────

    function test_reportWinners_singleWinner() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));

        ClankonBounty.Bounty memory b = bounty.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(ClankonBounty.BountyStatus.Resolved));

        address[] memory winners = bounty.getBountyWinners(bountyId);
        assertEq(winners.length, 1);
        assertEq(winners[0], solver1);

        uint256[] memory scores = bounty.getBountyScores(bountyId);
        assertEq(scores[0], 88);

        // 1000 USDC - 2.5% fee = 975 USDC to winner
        assertEq(bounty.winnerRewards(bountyId, solver1), 975e6);
        // Fee transferred to owner
        assertEq(usdc.balanceOf(owner), 25e6);
    }

    function test_reportWinners_twoWinners() public {
        uint256 bountyId = _createMultiWinnerBounty(2, _twoWinnerShares());
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory winners = new address[](2);
        winners[0] = solver1;
        winners[1] = solver2;
        uint256[] memory scores = new uint256[](2);
        scores[0] = 95;
        scores[1] = 88;

        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        // Net pool = 1000 - 25 = 975 USDC
        // solver1: 975 * 7000 / 10000 = 682.5 USDC
        // solver2: 975 * 3000 / 10000 = 292.5 USDC
        assertEq(bounty.winnerRewards(bountyId, solver1), 682_500_000);
        assertEq(bounty.winnerRewards(bountyId, solver2), 292_500_000);
    }

    function test_reportWinners_threeWinners() public {
        uint256 bountyId = _createMultiWinnerBounty(3, _threeWinnerShares());
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory winners = new address[](3);
        winners[0] = solver1;
        winners[1] = solver2;
        winners[2] = solver3;
        uint256[] memory scores = new uint256[](3);
        scores[0] = 95;
        scores[1] = 88;
        scores[2] = 72;

        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        // Net pool = 975 USDC
        // solver1: 975 * 6000 / 10000 = 585 USDC
        // solver2: 975 * 3000 / 10000 = 292.5 USDC
        // solver3: 975 * 1000 / 10000 = 97.5 USDC
        assertEq(bounty.winnerRewards(bountyId, solver1), 585_000_000);
        assertEq(bounty.winnerRewards(bountyId, solver2), 292_500_000);
        assertEq(bounty.winnerRewards(bountyId, solver3), 97_500_000);
    }

    function test_reportWinners_fewerThanConfigured() public {
        // 3-winner bounty but only 1 valid submission → full net pool to winner
        uint256 bountyId = _createMultiWinnerBounty(3, _threeWinnerShares());
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(90));

        // usedSharesBps = 6000, so reward = netPool * 6000 / 6000 = netPool
        assertEq(bounty.winnerRewards(bountyId, solver1), 975e6);
    }

    function test_reportWinners_reverts_notOracle() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(solver1);
        vm.expectRevert(ClankonBounty.OnlyOracle.selector);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));
    }

    function test_reportWinners_reverts_beforeDeadline() public {
        uint256 bountyId = _createSingleWinnerBounty();

        vm.prank(oracle);
        vm.expectRevert(ClankonBounty.DeadlineNotReached.selector);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));
    }

    function test_reportWinners_reverts_tooManyWinners() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory winners = new address[](2);
        winners[0] = solver1;
        winners[1] = solver2;
        uint256[] memory scores = new uint256[](2);
        scores[0] = 95;
        scores[1] = 88;

        vm.prank(oracle);
        vm.expectRevert(ClankonBounty.TooManyWinners.selector);
        bounty.reportWinners(bountyId, winners, scores);
    }

    function test_reportWinners_reverts_duplicateWinner() public {
        uint256 bountyId = _createMultiWinnerBounty(2, _twoWinnerShares());
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory winners = new address[](2);
        winners[0] = solver1;
        winners[1] = solver1; // duplicate
        uint256[] memory scores = new uint256[](2);
        scores[0] = 95;
        scores[1] = 88;

        vm.prank(oracle);
        vm.expectRevert(ClankonBounty.DuplicateWinner.selector);
        bounty.reportWinners(bountyId, winners, scores);
    }

    function test_reportWinners_reverts_zeroAddressWinner() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(oracle);
        vm.expectRevert(ClankonBounty.ZeroAddressWinner.selector);
        bounty.reportWinners(bountyId, _singleWinnerArray(address(0)), _singleScoreArray(88));
    }

    function test_reportWinners_reverts_lengthMismatch() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        uint256[] memory scores = new uint256[](2);
        scores[0] = 95;
        scores[1] = 88;

        vm.prank(oracle);
        vm.expectRevert(ClankonBounty.WinnersLengthMismatch.selector);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), scores);
    }

    // ─── Claiming ───────────────────────────────────────────────────────────────

    function test_claimReward_singleWinner() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));

        vm.prank(solver1);
        bounty.claimReward(bountyId);

        assertEq(usdc.balanceOf(solver1), 975e6);
        assertEq(usdc.balanceOf(owner), 25e6);

        ClankonBounty.Bounty memory b = bounty.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(ClankonBounty.BountyStatus.Claimed));
    }

    function test_claimReward_multiWinner_individualClaims() public {
        uint256 bountyId = _createMultiWinnerBounty(2, _twoWinnerShares());
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory winners = new address[](2);
        winners[0] = solver1;
        winners[1] = solver2;
        uint256[] memory scores = new uint256[](2);
        scores[0] = 95;
        scores[1] = 88;

        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        // solver1 claims first
        vm.prank(solver1);
        bounty.claimReward(bountyId);
        assertEq(usdc.balanceOf(solver1), 682_500_000);

        // Still Resolved (not all claimed)
        ClankonBounty.Bounty memory b = bounty.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(ClankonBounty.BountyStatus.Resolved));

        // solver2 claims
        vm.prank(solver2);
        bounty.claimReward(bountyId);
        assertEq(usdc.balanceOf(solver2), 292_500_000);

        // Now Claimed (all claimed)
        b = bounty.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(ClankonBounty.BountyStatus.Claimed));
    }

    function test_claimReward_reverts_notWinner() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));

        vm.prank(solver2);
        vm.expectRevert(ClankonBounty.NotWinner.selector);
        bounty.claimReward(bountyId);
    }

    function test_claimReward_reverts_alreadyClaimed() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));

        vm.prank(solver1);
        bounty.claimReward(bountyId);

        vm.prank(solver1);
        vm.expectRevert(ClankonBounty.AlreadyClaimed.selector);
        bounty.claimReward(bountyId);
    }

    // ─── Cancellation & Reclaim ─────────────────────────────────────────────────

    function test_cancelBounty_withPenalty() public {
        uint256 bountyId = _createSingleWinnerBounty();

        vm.prank(poster);
        bounty.cancelBounty(bountyId);

        // 80% penalty: 1000 USDC * 80% = 800 USDC to owner, 200 USDC refund to poster
        assertEq(usdc.balanceOf(poster), 10_000e6 - 800e6); // 9200 USDC
        assertEq(usdc.balanceOf(owner), 800e6);              // penalty
        assertEq(usdc.balanceOf(address(bounty)), 0);

        ClankonBounty.Bounty memory b = bounty.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(ClankonBounty.BountyStatus.Cancelled));
    }

    function test_cancelBounty_reverts_afterDeadline() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(poster);
        vm.expectRevert(ClankonBounty.DeadlineReached.selector);
        bounty.cancelBounty(bountyId);
    }

    function test_cancelBounty_reverts_atExactDeadline() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline);

        vm.prank(poster);
        vm.expectRevert(ClankonBounty.DeadlineReached.selector);
        bounty.cancelBounty(bountyId);
    }

    function test_reclaimBounty_afterGracePeriod() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 7 days + 1);

        vm.prank(poster);
        bounty.reclaimBounty(bountyId);

        assertEq(usdc.balanceOf(poster), 10_000e6);
    }

    function test_reclaimBounty_afterGracePeriod_partialClaims() public {
        // 2-winner bounty, only solver1 claims, poster reclaims solver2's share
        uint256 bountyId = _createMultiWinnerBounty(2, _twoWinnerShares());
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory winners = new address[](2);
        winners[0] = solver1;
        winners[1] = solver2;
        uint256[] memory scores = new uint256[](2);
        scores[0] = 95;
        scores[1] = 88;

        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        // solver1 claims their share
        vm.prank(solver1);
        bounty.claimReward(bountyId);

        // Warp past grace period
        vm.warp(deadline + 7 days + 1);

        // poster reclaims unclaimed portion
        uint256 posterBefore = usdc.balanceOf(poster);
        vm.prank(poster);
        bounty.reclaimBounty(bountyId);

        // solver2's 292.5 USDC was unclaimed, goes back to poster
        uint256 posterAfter = usdc.balanceOf(poster);
        assertEq(posterAfter - posterBefore, 292_500_000);
    }

    function test_reclaimBounty_reverts_duringGracePeriod() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(poster);
        vm.expectRevert(ClankonBounty.GracePeriodActive.selector);
        bounty.reclaimBounty(bountyId);
    }

    // ─── Admin ──────────────────────────────────────────────────────────────────

    function test_setPlatformFee() public {
        vm.prank(owner);
        bounty.setPlatformFee(500); // 5%

        assertEq(bounty.platformFeeBps(), 500);
    }

    function test_setPlatformFee_reverts_tooHigh() public {
        vm.prank(owner);
        vm.expectRevert(ClankonBounty.FeeTooHigh.selector);
        bounty.setPlatformFee(1500); // 15% > 10% max
    }

    function test_setOracle() public {
        address newOracle = makeAddr("newOracle");
        vm.prank(owner);
        bounty.setOracle(newOracle);

        assertEq(bounty.oracle(), newOracle);
    }

    function test_setOracle_reverts_zeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(ClankonBounty.ZeroAddress.selector);
        bounty.setOracle(address(0));
    }

    // ─── Pause ───────────────────────────────────────────────────────────────

    function test_pause_blocksCreateBounty() public {
        vm.prank(owner);
        bounty.pause();

        vm.prank(poster);
        vm.expectRevert();
        bounty.createBounty(
            address(usdc), BOUNTY_AMOUNT, block.timestamp + 1 days, EVAL_HASH, METADATA_URI, 1, _singleWinnerShares(), DEFAULT_FEE_BPS
        );
    }

    function test_pause_blocksCancelBounty() public {
        uint256 bountyId = _createSingleWinnerBounty();

        vm.prank(owner);
        bounty.pause();

        vm.prank(poster);
        vm.expectRevert();
        bounty.cancelBounty(bountyId);
    }

    function test_pause_allowsReclaimBounty() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.prank(owner);
        bounty.pause();

        vm.warp(deadline + 7 days + 1);

        // reclaimBounty should still work when paused
        vm.prank(poster);
        bounty.reclaimBounty(bountyId);

        assertEq(usdc.balanceOf(poster), 10_000e6);
    }

    function test_unpause_restoresOperations() public {
        vm.prank(owner);
        bounty.pause();

        vm.prank(owner);
        bounty.unpause();

        // createBounty works again
        uint256 bountyId = _createSingleWinnerBounty();
        assertEq(bountyId, 0);
    }

    // ─── Full Lifecycle ─────────────────────────────────────────────────────────

    function test_roundingDust_assignedToFirstWinner() public {
        // Use an odd amount that causes rounding: 1_999_999 (6 decimals)
        usdc.mint(poster, 1_999_999);
        uint256 deadline = block.timestamp + 1 days;

        vm.prank(poster);
        uint256 bountyId = bounty.createBounty(
            address(usdc), 1_999_999, deadline, EVAL_HASH, METADATA_URI, 3, _threeWinnerShares(), DEFAULT_FEE_BPS
        );

        vm.warp(deadline + 1);

        address[] memory winners = new address[](3);
        winners[0] = solver1;
        winners[1] = solver2;
        winners[2] = solver3;
        uint256[] memory scores = new uint256[](3);
        scores[0] = 95;
        scores[1] = 88;
        scores[2] = 72;

        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        // All three claim
        vm.prank(solver1);
        bounty.claimReward(bountyId);
        vm.prank(solver2);
        bounty.claimReward(bountyId);
        vm.prank(solver3);
        bounty.claimReward(bountyId);

        // Contract should have zero balance for this bounty (dust went to first winner)
        assertEq(bounty.bountyBalance(bountyId), 0);
    }

    function test_accountingInvariant_claimedPlusFeePlusReclaimEqualsDeposited() public {
        uint256 bountyId = _createMultiWinnerBounty(2, _twoWinnerShares());
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory winners = new address[](2);
        winners[0] = solver1;
        winners[1] = solver2;
        uint256[] memory scores = new uint256[](2);
        scores[0] = 95;
        scores[1] = 88;

        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        // Only solver1 claims
        vm.prank(solver1);
        bounty.claimReward(bountyId);

        vm.warp(deadline + 7 days + 1);

        vm.prank(poster);
        bounty.reclaimBounty(bountyId);

        // Invariant: fee (owner) + solver1 + reclaim (poster) == deposited
        uint256 fee = usdc.balanceOf(owner);
        uint256 claimed = usdc.balanceOf(solver1);
        uint256 posterFinal = usdc.balanceOf(poster);
        uint256 posterInitial = 10_000e6 - BOUNTY_AMOUNT;
        uint256 reclaimed = posterFinal - posterInitial;

        assertEq(fee + claimed + reclaimed, BOUNTY_AMOUNT);
    }

    function test_fullLifecycle_singleWinner() public {
        // 1. Poster creates bounty
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        // 2. Time passes
        vm.warp(deadline + 1);

        // 3. Oracle reports winner
        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(95));

        // 4. Winner claims
        vm.prank(solver1);
        bounty.claimReward(bountyId);

        // 5. Verify final state
        assertEq(usdc.balanceOf(solver1), 975e6);
        assertEq(usdc.balanceOf(owner), 25e6);
        assertEq(usdc.balanceOf(address(bounty)), 0);
    }

    // ─── Wallet Delegation ─────────────────────────────────────────────────

    function test_setDelegateWallet() public {
        address coldWallet = makeAddr("coldWallet");

        vm.prank(solver1);
        bounty.setDelegateWallet(coldWallet);

        assertEq(bounty.delegatedWallets(solver1), coldWallet);
        assertEq(bounty.getDelegateWallet(solver1), coldWallet);
    }

    function test_clearDelegateWallet() public {
        address coldWallet = makeAddr("coldWallet");

        vm.prank(solver1);
        bounty.setDelegateWallet(coldWallet);
        assertEq(bounty.getDelegateWallet(solver1), coldWallet);

        vm.prank(solver1);
        bounty.setDelegateWallet(address(0));
        assertEq(bounty.delegatedWallets(solver1), address(0));
        assertEq(bounty.getDelegateWallet(solver1), solver1);
    }

    function test_updateDelegateWallet() public {
        address cold1 = makeAddr("cold1");
        address cold2 = makeAddr("cold2");

        vm.prank(solver1);
        bounty.setDelegateWallet(cold1);
        assertEq(bounty.getDelegateWallet(solver1), cold1);

        vm.prank(solver1);
        bounty.setDelegateWallet(cold2);
        assertEq(bounty.getDelegateWallet(solver1), cold2);
    }

    function test_claimReward_withDelegation() public {
        address coldWallet = makeAddr("coldWallet");

        // Set delegation before claiming
        vm.prank(solver1);
        bounty.setDelegateWallet(coldWallet);

        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));

        vm.prank(solver1);
        bounty.claimReward(bountyId);

        // Tokens go to cold wallet, not solver1
        assertEq(usdc.balanceOf(coldWallet), 975e6);
        assertEq(usdc.balanceOf(solver1), 0);
    }

    function test_claimReward_withoutDelegation() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));

        vm.prank(solver1);
        bounty.claimReward(bountyId);

        // Tokens go to solver1 directly (no delegation)
        assertEq(usdc.balanceOf(solver1), 975e6);
    }

    function test_claimReward_onlyWinnerCanClaim_withDelegation() public {
        address coldWallet = makeAddr("coldWallet");

        // solver2 sets delegation — doesn't help them claim solver1's reward
        vm.prank(solver2);
        bounty.setDelegateWallet(coldWallet);

        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));

        // solver2 cannot claim even though they have delegation set
        vm.prank(solver2);
        vm.expectRevert(ClankonBounty.NotWinner.selector);
        bounty.claimReward(bountyId);
    }

    // ─── Reveal Bundle ──────────────────────────────────────────────────────

    function test_reportRevealSet_and_buyBundle() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory revealSolvers = new address[](2);
        revealSolvers[0] = solver1;
        revealSolvers[1] = solver2;

        vm.prank(oracle);
        bounty.reportRevealSet(bountyId, revealSolvers, _twoRevealShares(), 50e6);

        assertEq(bounty.getRevealBundlePrice(bountyId), 50e6);

        usdc.mint(solver3, 100e6);
        vm.prank(solver3);
        usdc.approve(address(bounty), type(uint256).max);

        vm.prank(solver3);
        bounty.buyRevealBundle(bountyId);

        assertTrue(bounty.hasRevealBundleAccess(bountyId, solver3));
        assertEq(bounty.getTotalRevealRevenue(bountyId), 50e6);
    }

    function test_reportRevealSet_reverts_duplicateSolver() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory revealSolvers = new address[](2);
        revealSolvers[0] = solver1;
        revealSolvers[1] = solver1;

        vm.prank(oracle);
        vm.expectRevert(ClankonBounty.DuplicateRevealSolver.selector);
        bounty.reportRevealSet(bountyId, revealSolvers, _twoRevealShares(), 50e6);
    }

    function test_buyRevealBundle_reverts_duplicateBuyer() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory revealSolvers = new address[](1);
        revealSolvers[0] = solver1;
        uint16[] memory shares = _singleWinnerShares();

        vm.prank(oracle);
        bounty.reportRevealSet(bountyId, revealSolvers, shares, 25e6);

        usdc.mint(solver3, 100e6);
        vm.prank(solver3);
        usdc.approve(address(bounty), type(uint256).max);

        vm.prank(solver3);
        bounty.buyRevealBundle(bountyId);

        vm.prank(solver3);
        vm.expectRevert(ClankonBounty.DuplicateBuyer.selector);
        bounty.buyRevealBundle(bountyId);
    }

    function test_claimRevealRevenue_usesDelegateWallet() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;
        address coldWallet = makeAddr("revealColdWallet");

        vm.warp(deadline + 1);

        address[] memory revealSolvers = new address[](2);
        revealSolvers[0] = solver1;
        revealSolvers[1] = solver2;

        vm.prank(oracle);
        bounty.reportRevealSet(bountyId, revealSolvers, _twoRevealShares(), 50e6);

        usdc.mint(solver3, 100e6);
        vm.prank(solver3);
        usdc.approve(address(bounty), type(uint256).max);
        vm.prank(solver3);
        bounty.buyRevealBundle(bountyId);

        vm.prank(solver1);
        bounty.setDelegateWallet(coldWallet);

        vm.prank(solver1);
        bounty.claimRevealRevenue(bountyId);

        assertEq(usdc.balanceOf(coldWallet), 33_335_000);
        assertEq(bounty.getRevealRevenueAvailable(bountyId, solver1), 0);
    }

    // ─── Full Lifecycle ─────────────────────────────────────────────────────

    // ─── Fee Tiers ──────────────────────────────────────────────────────────

    function test_createBounty_withHaikuFee() public {
        uint256 bountyId = _createSingleWinnerBountyWithFee(100); // Haiku 1%
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        assertEq(bounty.bountyFeeBps(bountyId), 100);

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));

        // 1000 USDC - 1% fee = 990 USDC to winner
        assertEq(bounty.winnerRewards(bountyId, solver1), 990e6);
        assertEq(usdc.balanceOf(owner), 10e6);
    }

    function test_createBounty_withOpusFee() public {
        uint256 bountyId = _createSingleWinnerBountyWithFee(500); // Opus 5%
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        assertEq(bounty.bountyFeeBps(bountyId), 500);

        vm.warp(deadline + 1);

        vm.prank(oracle);
        bounty.reportWinners(bountyId, _singleWinnerArray(solver1), _singleScoreArray(88));

        // 1000 USDC - 5% fee = 950 USDC to winner
        assertEq(bounty.winnerRewards(bountyId, solver1), 950e6);
        assertEq(usdc.balanceOf(owner), 50e6);
    }

    function test_createBounty_reverts_invalidFeeTier() public {
        vm.prank(poster);
        vm.expectRevert(ClankonBounty.InvalidFeeTier.selector);
        bounty.createBounty(
            address(usdc), BOUNTY_AMOUNT, block.timestamp + 1 days, EVAL_HASH, METADATA_URI, 1, _singleWinnerShares(), 300
        );
    }

    function test_setAllowedFeeTiers() public {
        uint16[] memory newTiers = new uint16[](2);
        newTiers[0] = 50;   // 0.5%
        newTiers[1] = 750;  // 7.5%

        vm.prank(owner);
        bounty.setAllowedFeeTiers(newTiers);

        assertTrue(bounty.isAllowedFeeTier(50));
        assertTrue(bounty.isAllowedFeeTier(750));
        assertFalse(bounty.isAllowedFeeTier(100)); // old tier removed
        assertFalse(bounty.isAllowedFeeTier(250)); // old tier removed

        uint16[] memory stored = bounty.getAllowedFeeTiers();
        assertEq(stored.length, 2);
        assertEq(stored[0], 50);
        assertEq(stored[1], 750);
    }

    function test_setAllowedFeeTiers_reverts_nonOwner() public {
        uint16[] memory newTiers = new uint16[](1);
        newTiers[0] = 50;

        vm.prank(solver1);
        vm.expectRevert();
        bounty.setAllowedFeeTiers(newTiers);
    }

    function test_setAllowedFeeTiers_reverts_feeTooHigh() public {
        uint16[] memory newTiers = new uint16[](1);
        newTiers[0] = 1500; // 15% > MAX_FEE_BPS

        vm.prank(owner);
        vm.expectRevert(ClankonBounty.FeeTooHigh.selector);
        bounty.setAllowedFeeTiers(newTiers);
    }

    function test_differentBounties_differentFees() public {
        uint256 bountyId1 = _createSingleWinnerBountyWithFee(100); // Haiku 1%
        uint256 bountyId2 = _createSingleWinnerBountyWithFee(500); // Opus 5%

        uint256 deadline1 = bounty.getBounty(bountyId1).deadline;
        uint256 deadline2 = bounty.getBounty(bountyId2).deadline;

        vm.warp(deadline2 + 1); // both past deadline

        vm.prank(oracle);
        bounty.reportWinners(bountyId1, _singleWinnerArray(solver1), _singleScoreArray(88));

        vm.prank(oracle);
        bounty.reportWinners(bountyId2, _singleWinnerArray(solver2), _singleScoreArray(90));

        // Bounty 1: 1% fee → 990 to winner, 10 fee
        assertEq(bounty.winnerRewards(bountyId1, solver1), 990e6);
        // Bounty 2: 5% fee → 950 to winner, 50 fee
        assertEq(bounty.winnerRewards(bountyId2, solver2), 950e6);
        // Owner gets both fees: 10 + 50 = 60
        assertEq(usdc.balanceOf(owner), 60e6);
    }

    function test_fullLifecycle_threeWinners() public {
        // 1. Create 3-winner bounty
        uint256 bountyId = _createMultiWinnerBounty(3, _threeWinnerShares());
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        // 2. Time passes
        vm.warp(deadline + 1);

        // 3. Oracle reports 3 winners
        address[] memory winners = new address[](3);
        winners[0] = solver1;
        winners[1] = solver2;
        winners[2] = solver3;
        uint256[] memory scores = new uint256[](3);
        scores[0] = 95;
        scores[1] = 88;
        scores[2] = 72;

        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        // 4. All winners claim
        vm.prank(solver1);
        bounty.claimReward(bountyId);
        vm.prank(solver2);
        bounty.claimReward(bountyId);
        vm.prank(solver3);
        bounty.claimReward(bountyId);

        // 5. Verify final state
        assertEq(usdc.balanceOf(solver1), 585_000_000); // 60%
        assertEq(usdc.balanceOf(solver2), 292_500_000); // 30%
        assertEq(usdc.balanceOf(solver3), 97_500_000);  // 10%
        assertEq(usdc.balanceOf(owner), 25_000_000);    // 2.5% fee

        ClankonBounty.Bounty memory b = bounty.getBounty(bountyId);
        assertEq(uint8(b.status), uint8(ClankonBounty.BountyStatus.Claimed));
    }
}
