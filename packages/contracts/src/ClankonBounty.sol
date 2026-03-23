// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title ClankonBounty — Agent-to-agent bounty escrow with multi-winner support
/// @notice Poster deposits USDC, oracle reports eval winners, winners claim proportional rewards
contract ClankonBounty is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────────────────

    enum BountyStatus {
        Active,
        Resolved,
        Claimed,
        Cancelled
    }

    struct Bounty {
        address poster;
        address token;
        uint256 amount;
        uint256 deadline;
        bytes32 evalHash;
        string metadataURI;
        uint8 numWinners;
        BountyStatus status;
    }

    // ─── State ───────────────────────────────────────────────────────────────────

    mapping(uint256 => Bounty) internal _bounties;
    uint256 public nextBountyId;

    mapping(uint256 => uint16[]) internal _sharesBps;
    mapping(uint256 => address[]) internal _winners;
    mapping(uint256 => uint256[]) internal _winnerScores;
    mapping(uint256 => mapping(address => uint256)) public winnerRewards;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => uint256) public bountyBalance;
    mapping(uint256 => address[]) internal _revealSolvers;
    mapping(uint256 => uint16[]) internal _revealSharesBps;
    mapping(uint256 => mapping(address => bool)) internal _isRevealSolver;
    mapping(uint256 => mapping(address => uint16)) internal _revealShareBpsBySolver;
    mapping(uint256 => mapping(address => bool)) public revealBundleAccess;
    mapping(uint256 => mapping(address => uint256)) public revealRevenueClaimed;
    mapping(uint256 => uint256) public revealBundlePrice;
    mapping(uint256 => uint256) public totalRevealRevenue;

    address public oracle;
    uint256 public platformFeeBps = 250; // 2.5% (default for legacy bounties)

    mapping(uint256 => uint16) public bountyFeeBps; // per-bounty fee tier
    uint16[] internal _allowedFeeTiers; // e.g. [100, 250, 500]
    mapping(uint16 => bool) public isAllowedFeeTier; // quick lookup

    uint256 public constant MAX_FEE_BPS = 1000; // 10%
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant GRACE_PERIOD = 7 days;
    uint8 public constant MAX_WINNERS = 3;
    uint256 public constant MAX_DURATION = 90 days;
    uint256 public constant MAX_CANCEL_PENALTY_BPS = 10000; // 100%
    uint256 public cancelPenaltyBps = 8000; // 80%
    uint256 public constant MIN_AMOUNT = 1_000_000; // 1 USDC (6 decimals)

    mapping(address => bool) public allowedTokens;
    mapping(address => address) public delegatedWallets;

    // ─── Events ──────────────────────────────────────────────────────────────────

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed poster,
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 numWinners,
        uint16 feeBps
    );
    event WinnersReported(uint256 indexed bountyId, address[] winners, uint256[] scores);
    event RewardClaimed(uint256 indexed bountyId, address indexed winner, address indexed recipient, uint256 reward);
    event WalletDelegated(address indexed agent, address indexed delegate);
    event BountyReclaimed(uint256 indexed bountyId, address indexed poster, uint256 amount);
    event BountyCancelled(uint256 indexed bountyId, uint256 refund, uint256 penalty);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event TokenAllowanceUpdated(address indexed token, bool allowed);
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeTiersUpdated(uint16[] tiers);
    event CancelPenaltyUpdated(uint256 oldPenalty, uint256 newPenalty);
    event RevealSetReported(uint256 indexed bountyId, address[] revealedSolvers, uint16[] revealSharesBps, uint256 bundlePrice);
    event RevealBundlePurchased(uint256 indexed bountyId, address indexed buyer, uint256 amount);
    event RevealRevenueClaimed(uint256 indexed bountyId, address indexed solver, address indexed recipient, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────────────

    error TokenNotAllowed();
    error DeadlineTooSoon();
    error AmountZero();
    error AmountTooLow();
    error OnlyOracle();
    error BountyNotActive();
    error DeadlineNotReached();
    error NotWinner();
    error NotPoster();
    error GracePeriodActive();
    error FeeTooHigh();
    error InvalidPayoutConfig();
    error SharesMustSumTo10000();
    error TooManyWinners();
    error AlreadyClaimed();
    error WinnersLengthMismatch();
    error NothingToClaim();
    error DeadlineReached();
    error DuplicateWinner();
    error ZeroAddressWinner();
    error ZeroAddress();
    error DeadlineTooFar();
    error PenaltyTooHigh();
    error RevealAlreadyReported();
    error RevealNotReported();
    error RevealBundlePriceZero();
    error DuplicateBuyer();
    error DuplicateRevealSolver();
    error ZeroAddressRevealSolver();
    error InvalidRevealSet();
    error NotRevealSolver();
    error InvalidFeeTier();

    // ─── Constructor ─────────────────────────────────────────────────────────────

    constructor(address _oracle, address _owner) Ownable(_owner) {
        oracle = _oracle;
        // Initialize default fee tiers: Haiku 1%, Sonnet 2.5%, Opus 5%
        _allowedFeeTiers = [100, 250, 500];
        isAllowedFeeTier[100] = true;
        isAllowedFeeTier[250] = true;
        isAllowedFeeTier[500] = true;
    }

    // ─── Poster Functions ────────────────────────────────────────────────────────

    /// @notice Create a bounty and escrow tokens
    /// @param token ERC20 token address (e.g. USDC)
    /// @param amount Reward amount (in token's smallest unit)
    /// @param deadline Unix timestamp when submissions close
    /// @param evalHash keccak256 hash of the eval script
    /// @param metadataURI Link to full bounty details (IPFS/URL)
    /// @param numWinners Number of winners (1-3)
    /// @param sharesBps Payout shares in basis points, must sum to 10000
    /// @param feeBps Platform fee tier in basis points (must be an allowed tier)
    function createBounty(
        address token,
        uint256 amount,
        uint256 deadline,
        bytes32 evalHash,
        string calldata metadataURI,
        uint8 numWinners,
        uint16[] calldata sharesBps,
        uint16 feeBps
    ) external nonReentrant whenNotPaused returns (uint256 bountyId) {
        if (!allowedTokens[token]) revert TokenNotAllowed();
        if (deadline < block.timestamp + MIN_DURATION) revert DeadlineTooSoon();
        if (deadline > block.timestamp + MAX_DURATION) revert DeadlineTooFar();
        if (amount == 0) revert AmountZero();
        if (amount < MIN_AMOUNT) revert AmountTooLow();
        if (numWinners == 0 || numWinners > MAX_WINNERS) revert InvalidPayoutConfig();
        if (sharesBps.length != numWinners) revert InvalidPayoutConfig();
        if (!isAllowedFeeTier[feeBps]) revert InvalidFeeTier();

        uint256 totalShares;
        for (uint256 i = 0; i < sharesBps.length; i++) {
            totalShares += sharesBps[i];
        }
        if (totalShares != 10000) revert SharesMustSumTo10000();

        bountyId = nextBountyId++;

        _bounties[bountyId] = Bounty({
            poster: msg.sender,
            token: token,
            amount: amount,
            deadline: deadline,
            evalHash: evalHash,
            metadataURI: metadataURI,
            numWinners: numWinners,
            status: BountyStatus.Active
        });

        _sharesBps[bountyId] = sharesBps;
        bountyFeeBps[bountyId] = feeBps;
        bountyBalance[bountyId] = amount;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit BountyCreated(bountyId, msg.sender, token, amount, deadline, numWinners, feeBps);
    }

    /// @notice Poster cancels bounty before deadline if no winner reported
    function cancelBounty(uint256 bountyId) external nonReentrant whenNotPaused {
        Bounty storage b = _bounties[bountyId];
        if (msg.sender != b.poster) revert NotPoster();
        if (b.status != BountyStatus.Active) revert BountyNotActive();
        if (block.timestamp >= b.deadline) revert DeadlineReached();

        b.status = BountyStatus.Cancelled;
        uint256 balance = bountyBalance[bountyId];
        bountyBalance[bountyId] = 0;

        uint256 penalty = (balance * cancelPenaltyBps) / 10000;
        uint256 refund = balance - penalty;

        if (refund > 0) {
            IERC20(b.token).safeTransfer(b.poster, refund);
        }
        if (penalty > 0) {
            IERC20(b.token).safeTransfer(owner(), penalty);
        }

        emit BountyCancelled(bountyId, refund, penalty);
    }

    /// @notice Poster reclaims funds after deadline + grace period (unclaimed rewards or no winners)
    function reclaimBounty(uint256 bountyId) external nonReentrant {
        Bounty storage b = _bounties[bountyId];
        if (msg.sender != b.poster) revert NotPoster();
        if (b.status != BountyStatus.Active && b.status != BountyStatus.Resolved) revert BountyNotActive();
        if (block.timestamp < b.deadline + GRACE_PERIOD) revert GracePeriodActive();

        uint256 balance = bountyBalance[bountyId];
        bountyBalance[bountyId] = 0;
        b.status = BountyStatus.Cancelled;

        if (balance > 0) {
            IERC20(b.token).safeTransfer(b.poster, balance);
        }

        emit BountyReclaimed(bountyId, b.poster, balance);
    }

    // ─── Oracle Functions ────────────────────────────────────────────────────────

    /// @notice Oracle reports winners after deadline. Fee transferred immediately, rewards stored for claiming.
    /// @dev If fewer winners than numWinners, shares are scaled proportionally so full net pool is distributed.
    function reportWinners(
        uint256 bountyId,
        address[] calldata winners,
        uint256[] calldata scores
    ) external nonReentrant whenNotPaused {
        if (msg.sender != oracle) revert OnlyOracle();

        Bounty storage b = _bounties[bountyId];
        if (b.status != BountyStatus.Active) revert BountyNotActive();
        if (block.timestamp < b.deadline) revert DeadlineNotReached();
        if (winners.length == 0 || winners.length > b.numWinners) revert TooManyWinners();
        if (winners.length != scores.length) revert WinnersLengthMismatch();

        // Reject zero-address and duplicate winners
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] == address(0)) revert ZeroAddressWinner();
            for (uint256 j = 0; j < i; j++) {
                if (winners[j] == winners[i]) revert DuplicateWinner();
            }
        }

        uint256 fee = (b.amount * bountyFeeBps[bountyId]) / 10000;
        uint256 netPool = b.amount - fee;

        // Sum the shares for reported winners (scale if fewer than configured)
        uint16[] storage shares = _sharesBps[bountyId];
        uint256 usedSharesBps;
        for (uint256 i = 0; i < winners.length; i++) {
            usedSharesBps += shares[i];
        }

        // Compute per-winner rewards
        uint256 totalDistributed;
        for (uint256 i = 0; i < winners.length; i++) {
            uint256 reward = (netPool * shares[i]) / usedSharesBps;
            winnerRewards[bountyId][winners[i]] = reward;
            totalDistributed += reward;
        }

        // Assign rounding dust to first winner so no tokens get permanently locked
        uint256 dust = netPool - totalDistributed;
        if (dust > 0) {
            winnerRewards[bountyId][winners[0]] += dust;
        }

        _winners[bountyId] = winners;
        _winnerScores[bountyId] = scores;
        b.status = BountyStatus.Resolved;

        // Only deduct fee (actually transferred). Rewards deducted when claimed.
        bountyBalance[bountyId] -= fee;

        if (fee > 0) {
            IERC20(b.token).safeTransfer(owner(), fee);
        }

        emit WinnersReported(bountyId, winners, scores);
    }

    /// @notice Oracle reports the frozen reveal set and bundle price after deadline.
    function reportRevealSet(
        uint256 bountyId,
        address[] calldata revealedSolvers,
        uint16[] calldata revealShares,
        uint256 bundlePrice
    ) external nonReentrant whenNotPaused {
        if (msg.sender != oracle) revert OnlyOracle();
        Bounty storage b = _bounties[bountyId];
        if (b.poster == address(0)) revert BountyNotActive();
        if (b.status == BountyStatus.Cancelled) revert BountyNotActive();
        if (block.timestamp < b.deadline) revert DeadlineNotReached();
        if (bundlePrice == 0) revert RevealBundlePriceZero();
        if (_revealSolvers[bountyId].length != 0) revert RevealAlreadyReported();
        if (revealedSolvers.length == 0 || revealedSolvers.length != revealShares.length) {
            revert InvalidRevealSet();
        }

        uint256 totalShares;
        for (uint256 i = 0; i < revealedSolvers.length; i++) {
            address solver = revealedSolvers[i];
            if (solver == address(0)) revert ZeroAddressRevealSolver();
            if (_isRevealSolver[bountyId][solver]) revert DuplicateRevealSolver();

            _isRevealSolver[bountyId][solver] = true;
            _revealShareBpsBySolver[bountyId][solver] = revealShares[i];
            _revealSolvers[bountyId].push(solver);
            _revealSharesBps[bountyId].push(revealShares[i]);
            totalShares += revealShares[i];
        }

        if (totalShares != 10000) revert SharesMustSumTo10000();

        revealBundlePrice[bountyId] = bundlePrice;

        emit RevealSetReported(bountyId, revealedSolvers, revealShares, bundlePrice);
    }

    // ─── Winner Functions ────────────────────────────────────────────────────────

    /// @notice Winner claims their pre-computed reward. Tokens go to delegate wallet if set.
    /// @dev Intentionally pause-gated even though reclaimBounty is not, to allow emergency fund recovery by posters.
    function claimReward(uint256 bountyId) external nonReentrant whenNotPaused {
        uint256 reward = winnerRewards[bountyId][msg.sender];
        if (reward == 0) revert NotWinner();
        if (hasClaimed[bountyId][msg.sender]) revert AlreadyClaimed();

        Bounty storage b = _bounties[bountyId];
        if (b.status != BountyStatus.Resolved) revert BountyNotActive();

        hasClaimed[bountyId][msg.sender] = true;
        bountyBalance[bountyId] -= reward;

        // Send to delegate wallet if set, otherwise to msg.sender
        address recipient = delegatedWallets[msg.sender];
        if (recipient == address(0)) {
            recipient = msg.sender;
        }
        IERC20(b.token).safeTransfer(recipient, reward);

        // Check if all winners claimed
        address[] storage winners = _winners[bountyId];
        bool allClaimed = true;
        for (uint256 i = 0; i < winners.length; i++) {
            if (!hasClaimed[bountyId][winners[i]]) {
                allClaimed = false;
                break;
            }
        }
        if (allClaimed) {
            b.status = BountyStatus.Claimed;
        }

        emit RewardClaimed(bountyId, msg.sender, recipient, reward);
    }

    /// @notice Buy permanent access to the frozen reveal bundle for this bounty.
    function buyRevealBundle(uint256 bountyId) external nonReentrant whenNotPaused {
        Bounty storage b = _bounties[bountyId];
        uint256 price = revealBundlePrice[bountyId];
        if (b.status == BountyStatus.Cancelled) revert BountyNotActive();
        if (price == 0) revert RevealNotReported();
        if (revealBundleAccess[bountyId][msg.sender]) revert DuplicateBuyer();

        revealBundleAccess[bountyId][msg.sender] = true;
        totalRevealRevenue[bountyId] += price;

        IERC20(b.token).safeTransferFrom(msg.sender, address(this), price);

        emit RevealBundlePurchased(bountyId, msg.sender, price);
    }

    /// @notice Claim accrued reveal revenue for the caller if they are in the reveal set.
    function claimRevealRevenue(uint256 bountyId) external nonReentrant whenNotPaused {
        if (!_isRevealSolver[bountyId][msg.sender]) revert NotRevealSolver();

        Bounty storage b = _bounties[bountyId];
        uint256 accrued = getRevealRevenueAccrued(bountyId, msg.sender);
        uint256 claimed = revealRevenueClaimed[bountyId][msg.sender];
        if (accrued <= claimed) revert NothingToClaim();

        uint256 amount = accrued - claimed;
        revealRevenueClaimed[bountyId][msg.sender] = accrued;

        address recipient = delegatedWallets[msg.sender];
        if (recipient == address(0)) {
            recipient = msg.sender;
        }

        IERC20(b.token).safeTransfer(recipient, amount);

        emit RevealRevenueClaimed(bountyId, msg.sender, recipient, amount);
    }

    // ─── Delegation Functions ─────────────────────────────────────────────────

    /// @notice Set a delegate wallet to receive bounty rewards on your behalf
    /// @param delegate Address to receive rewards. Set to address(0) to clear delegation.
    function setDelegateWallet(address delegate) external {
        delegatedWallets[msg.sender] = delegate;
        emit WalletDelegated(msg.sender, delegate);
    }

    /// @notice Get the effective reward recipient for an agent
    /// @return The delegate address if set, otherwise the agent address itself
    function getDelegateWallet(address agent) external view returns (address) {
        address delegate = delegatedWallets[agent];
        return delegate == address(0) ? agent : delegate;
    }

    // ─── View Functions ──────────────────────────────────────────────────────────

    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return _bounties[bountyId];
    }

    function getBountyCount() external view returns (uint256) {
        return nextBountyId;
    }

    function getBountyWinners(uint256 bountyId) external view returns (address[] memory) {
        return _winners[bountyId];
    }

    function getBountyScores(uint256 bountyId) external view returns (uint256[] memory) {
        return _winnerScores[bountyId];
    }

    function getBountyShares(uint256 bountyId) external view returns (uint16[] memory) {
        return _sharesBps[bountyId];
    }

    function getRevealBundlePrice(uint256 bountyId) external view returns (uint256) {
        return revealBundlePrice[bountyId];
    }

    function getRevealSetWallets(uint256 bountyId) external view returns (address[] memory) {
        return _revealSolvers[bountyId];
    }

    function getRevealSetShares(uint256 bountyId) external view returns (uint16[] memory) {
        return _revealSharesBps[bountyId];
    }

    function hasRevealBundleAccess(uint256 bountyId, address buyer) external view returns (bool) {
        return revealBundleAccess[bountyId][buyer];
    }

    function getRevealRevenueClaimed(uint256 bountyId, address solver) external view returns (uint256) {
        return revealRevenueClaimed[bountyId][solver];
    }

    function getTotalRevealRevenue(uint256 bountyId) external view returns (uint256) {
        return totalRevealRevenue[bountyId];
    }

    function getRevealRevenueAccrued(uint256 bountyId, address solver) public view returns (uint256) {
        uint16 shareBps = _revealShareBpsBySolver[bountyId][solver];
        if (shareBps == 0) {
            return 0;
        }
        return (totalRevealRevenue[bountyId] * uint256(shareBps)) / 10000;
    }

    function getRevealRevenueAvailable(uint256 bountyId, address solver) external view returns (uint256) {
        uint256 accrued = getRevealRevenueAccrued(bountyId, solver);
        uint256 claimed = revealRevenueClaimed[bountyId][solver];
        return accrued > claimed ? accrued - claimed : 0;
    }

    // ─── Admin Functions ─────────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert ZeroAddress();
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    function setAllowedToken(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        allowedTokens[token] = allowed;
        emit TokenAllowanceUpdated(token, allowed);
    }

    function setPlatformFee(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit PlatformFeeUpdated(platformFeeBps, _feeBps);
        platformFeeBps = _feeBps;
    }

    function setAllowedFeeTiers(uint16[] calldata tiers) external onlyOwner {
        // Clear old tiers
        for (uint256 i = 0; i < _allowedFeeTiers.length; i++) {
            isAllowedFeeTier[_allowedFeeTiers[i]] = false;
        }
        // Set new tiers
        delete _allowedFeeTiers;
        for (uint256 i = 0; i < tiers.length; i++) {
            if (tiers[i] > MAX_FEE_BPS) revert FeeTooHigh();
            _allowedFeeTiers.push(tiers[i]);
            isAllowedFeeTier[tiers[i]] = true;
        }
        emit FeeTiersUpdated(tiers);
    }

    function getAllowedFeeTiers() external view returns (uint16[] memory) {
        return _allowedFeeTiers;
    }

    function setCancelPenalty(uint256 _penaltyBps) external onlyOwner {
        if (_penaltyBps > MAX_CANCEL_PENALTY_BPS) revert PenaltyTooHigh();
        emit CancelPenaltyUpdated(cancelPenaltyBps, _penaltyBps);
        cancelPenaltyBps = _penaltyBps;
    }

    /// @dev Override to prevent accidental renouncement of ownership
    function renounceOwnership() public pure override {
        revert("Ownership renouncement disabled");
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
