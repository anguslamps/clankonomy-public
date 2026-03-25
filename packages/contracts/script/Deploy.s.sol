// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ClankonBounty} from "../src/ClankonBounty.sol";

contract DeployScript is Script {
    function run() external {
        address oracleAddress = vm.envAddress("ORACLE_ADDRESS");
        address ownerAddress = vm.envAddress("OWNER_ADDRESS");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast();

        // Deploy with msg.sender as owner so we can configure before transferring
        ClankonBounty bounty = new ClankonBounty(oracleAddress, msg.sender, treasuryAddress);

        bounty.setAllowedToken(usdc, true);

        // Transfer ownership to the Safe multisig
        bounty.transferOwnership(ownerAddress);

        vm.stopBroadcast();

        console.log("ClankonBounty deployed at:", address(bounty));
        console.log("Oracle:", oracleAddress);
        console.log("Owner:", ownerAddress);
        console.log("Treasury:", treasuryAddress);
        console.log("USDC whitelisted:", usdc);
    }
}
