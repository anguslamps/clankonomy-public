// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ClankonBounty} from "../src/ClankonBounty.sol";
import {ClankonERC8183Adapter} from "../src/ClankonERC8183Adapter.sol";
import {IERC8183Job} from "../src/interfaces/IERC8183Job.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC8183 is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract ClankonERC8183AdapterTest is Test {
    ClankonBounty public bounty;
    ClankonERC8183Adapter public adapter;
    MockUSDC8183 public usdc;

    address owner = makeAddr("owner");
    address oracle = makeAddr("oracle");
    address poster = makeAddr("poster");
    address solver1 = makeAddr("solver1");
    address solver2 = makeAddr("solver2");
    address solver3 = makeAddr("solver3");

    uint256 constant BOUNTY_AMOUNT = 1000e6;
    bytes32 constant EVAL_HASH = keccak256("eval_script_v1");
    string constant METADATA_URI = "ipfs://QmExample";

    function setUp() public {
        usdc = new MockUSDC8183();
        bounty = new ClankonBounty(oracle, owner);
        adapter = new ClankonERC8183Adapter(address(bounty));

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

    function _threeWinnerShares() internal pure returns (uint16[] memory) {
        uint16[] memory shares = new uint16[](3);
        shares[0] = 6000;
        shares[1] = 3000;
        shares[2] = 1000;
        return shares;
    }

    function _createSingleWinnerBounty() internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 days;
        vm.prank(poster);
        return bounty.createBounty(
            address(usdc), BOUNTY_AMOUNT, deadline, EVAL_HASH, METADATA_URI, 1, _singleWinnerShares(), 250
        );
    }

    function _createMultiWinnerBounty() internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 days;
        vm.prank(poster);
        return bounty.createBounty(
            address(usdc), BOUNTY_AMOUNT, deadline, EVAL_HASH, METADATA_URI, 3, _threeWinnerShares(), 250
        );
    }

    // ─── Constructor ────────────────────────────────────────────────────────────

    function test_constructor_setsAddress() public view {
        assertEq(address(adapter.bountyContract()), address(bounty));
    }

    // ─── Job Count ──────────────────────────────────────────────────────────────

    function test_getJobCount_zero() public view {
        assertEq(adapter.getJobCount(), 0);
    }

    function test_getJobCount_afterCreation() public {
        _createSingleWinnerBounty();
        assertEq(adapter.getJobCount(), 1);

        _createSingleWinnerBounty();
        assertEq(adapter.getJobCount(), 2);
    }

    // ─── Status: Funded ─────────────────────────────────────────────────────────

    function test_getJob_activeBounty_statusFunded() public {
        uint256 bountyId = _createSingleWinnerBounty();

        (
            address requester,
            address provider,
            address evaluator,
            address token,
            uint256 amount,
            IERC8183Job.JobStatus status,
            address hook
        ) = adapter.getJob(bountyId);

        assertEq(requester, poster);
        assertEq(provider, address(0)); // No winner yet
        assertEq(evaluator, oracle);
        assertEq(token, address(usdc));
        assertEq(amount, BOUNTY_AMOUNT);
        assertEq(uint8(status), uint8(IERC8183Job.JobStatus.Funded));
        assertEq(hook, address(0)); // No hooks (Decision 5)
    }

    // ─── Status: Submitted (post-deadline, pre-resolution) ──────────────────────

    function test_getJob_postDeadline_statusSubmitted() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        (, , , , , IERC8183Job.JobStatus status, ) = adapter.getJob(bountyId);
        assertEq(uint8(status), uint8(IERC8183Job.JobStatus.Submitted));
    }

    // ─── Status: Completed ──────────────────────────────────────────────────────

    function test_getJob_resolved_statusCompleted() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory winners = new address[](1);
        winners[0] = solver1;
        uint256[] memory scores = new uint256[](1);
        scores[0] = 88;

        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        (
            address requester,
            address provider,
            ,
            ,
            ,
            IERC8183Job.JobStatus status,
        ) = adapter.getJob(bountyId);

        assertEq(requester, poster);
        assertEq(provider, solver1); // First winner as provider
        assertEq(uint8(status), uint8(IERC8183Job.JobStatus.Completed));
    }

    function test_getJob_claimed_statusCompleted() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        vm.warp(deadline + 1);

        address[] memory winners = new address[](1);
        winners[0] = solver1;
        uint256[] memory scores = new uint256[](1);
        scores[0] = 88;

        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        vm.prank(solver1);
        bounty.claimReward(bountyId);

        (, , , , , IERC8183Job.JobStatus status, ) = adapter.getJob(bountyId);
        assertEq(uint8(status), uint8(IERC8183Job.JobStatus.Completed));
    }

    // ─── Status: Rejected ───────────────────────────────────────────────────────

    function test_getJob_cancelled_statusRejected() public {
        uint256 bountyId = _createSingleWinnerBounty();

        vm.prank(poster);
        bounty.cancelBounty(bountyId);

        (, , , , , IERC8183Job.JobStatus status, ) = adapter.getJob(bountyId);
        assertEq(uint8(status), uint8(IERC8183Job.JobStatus.Rejected));
    }

    // ─── Multi-Winner ───────────────────────────────────────────────────────────

    function test_getJob_multiWinner_firstWinnerAsProvider() public {
        uint256 bountyId = _createMultiWinnerBounty();
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

        (, address provider, , , , , ) = adapter.getJob(bountyId);
        assertEq(provider, solver1); // First winner
    }

    // ─── Unresolved Bounty ──────────────────────────────────────────────────────

    function test_getJob_unresolved_providerZero() public {
        uint256 bountyId = _createSingleWinnerBounty();

        (, address provider, , , , , ) = adapter.getJob(bountyId);
        assertEq(provider, address(0));
    }

    // ─── Hook always zero ───────────────────────────────────────────────────────

    function test_getJob_hookAlwaysZero() public {
        uint256 bountyId = _createSingleWinnerBounty();
        uint256 deadline = bounty.getBounty(bountyId).deadline;

        // Funded state
        (, , , , , , address hook1) = adapter.getJob(bountyId);
        assertEq(hook1, address(0));

        // Post-deadline (Submitted)
        vm.warp(deadline + 1);
        (, , , , , , address hook2) = adapter.getJob(bountyId);
        assertEq(hook2, address(0));

        // Resolved (Completed)
        address[] memory winners = new address[](1);
        winners[0] = solver1;
        uint256[] memory scores = new uint256[](1);
        scores[0] = 88;
        vm.prank(oracle);
        bounty.reportWinners(bountyId, winners, scores);

        (, , , , , , address hook3) = adapter.getJob(bountyId);
        assertEq(hook3, address(0));
    }
}
