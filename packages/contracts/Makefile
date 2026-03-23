# ─── Clankonomy Contract Deployment ──────────────────────────────────────────
# Usage:
#   make deploy-testnet PRIVATE_KEY=0x...
#   make deploy-mainnet PRIVATE_KEY=0x...
#   make verify-testnet
#   make verify-mainnet

include .env.testnet
export

# Override with mainnet env for mainnet targets
.PHONY: deploy-testnet deploy-mainnet verify-testnet verify-mainnet

deploy-testnet:
	@echo "Deploying to Base Sepolia..."
	@set -a && . ./.env.testnet && set +a && \
	forge script script/Deploy.s.sol:DeployScript \
		--rpc-url $${RPC_URL} \
		--private-key $(PRIVATE_KEY) \
		--broadcast \
		-vvvv

deploy-mainnet:
	@echo "Deploying to Base Mainnet..."
	@set -a && . ./.env.mainnet && set +a && \
	forge script script/Deploy.s.sol:DeployScript \
		--rpc-url $${RPC_URL} \
		--private-key $(PRIVATE_KEY) \
		--broadcast \
		--verify \
		-vvvv

verify-testnet:
	@echo "Verifying on Base Sepolia..."
	forge verify-contract $(CONTRACT) src/ClankonBounty.sol:ClankonBounty \
		--chain-id 84532 \
		--etherscan-api-key $(ETHERSCAN_API_KEY) \
		--verifier-url https://api-sepolia.basescan.org/api

verify-mainnet:
	@echo "Verifying on Base Mainnet..."
	forge verify-contract $(CONTRACT) src/ClankonBounty.sol:ClankonBounty \
		--chain-id 8453 \
		--etherscan-api-key $(ETHERSCAN_API_KEY) \
		--verifier-url https://api.basescan.org/api
