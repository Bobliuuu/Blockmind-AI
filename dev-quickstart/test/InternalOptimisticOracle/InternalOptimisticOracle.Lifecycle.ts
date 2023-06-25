import {
  ExpandedERC20Ethers,
  MockOracleAncillaryEthers,
  OptimisticOracleV2Ethers,
  StoreEthers,
} from "@uma/contracts-node";
import { InternalOptimisticOracle } from "../../typechain";
import { internalOptimisticOracleFixture, seedAndApprove, umaEcosystemFixture } from "../fixtures";
import { BigNumber, ethers, expect, SignerWithAddress } from "../utils";
import hre from "hardhat";

let internalOptimisticOracle: InternalOptimisticOracle, usdc: ExpandedERC20Ethers;
let optimisticOracle: OptimisticOracleV2Ethers, store: StoreEthers, mockOracle: MockOracleAncillaryEthers;
let requester: SignerWithAddress;
let ancillaryData: Uint8Array, liveness: number;
let wrongAnswer: BigNumber;
let correctAnswer: BigNumber;

describe("InternalOptimisticOracle: Lifecycle", function () {
  beforeEach(async function () {
    // Load accounts and run fixtures to set up tests.
    [requester] = await ethers.getSigners();
    ({ optimisticOracle, mockOracle, store } = await umaEcosystemFixture());
    ({ internalOptimisticOracle, usdc } = await internalOptimisticOracleFixture());

    const amountToSeedWallets = hre.ethers.utils.parseUnits("100000", await usdc.decimals()); // 10000 USDC

    ancillaryData = ethers.utils.toUtf8Bytes(`q: "What uint256 are we looking for?"`);
    liveness = 3600; // 1 hour
    wrongAnswer = BigNumber.from(1);
    correctAnswer = BigNumber.from(2);

    // Set the final fee in the store
    await store.setFinalFee(usdc.address, { rawValue: hre.ethers.utils.parseUnits("1500", await usdc.decimals()) });

    // Mint some fresh tokens for the requester
    await seedAndApprove([requester], usdc, amountToSeedWallets, internalOptimisticOracle.address);
  });

  it("Proposed price with no dispute", async function () {
    const requestTimestamp = await internalOptimisticOracle.getCurrentTime();

    await internalOptimisticOracle.requestPrice(
      requestTimestamp,
      ancillaryData,
      hre.ethers.utils.parseUnits("20", await usdc.decimals()),
      hre.ethers.utils.parseUnits("500", await usdc.decimals()),
      liveness
    );

    // Proposer proposes the answer.
    const tx = await internalOptimisticOracle.proposePrice(requestTimestamp, ancillaryData, correctAnswer);
    const receipt = await tx.wait();

    const block = await ethers.provider.getBlock(receipt.blockNumber);

    // Set time after liveness
    await internalOptimisticOracle.setCurrentTime(block.timestamp + liveness);

    // Settle and get price
    await internalOptimisticOracle.settleAndGetPrice(requestTimestamp, ancillaryData);

    expect(await internalOptimisticOracle.getPrice(requestTimestamp, ancillaryData)).to.deep.equal(correctAnswer);

    expect(await usdc.balanceOf(internalOptimisticOracle.address)).to.deep.equal(BigNumber.from(0));
  });

  it("Dispute with dvm arbitration", async function () {
    const requestTimestamp = await internalOptimisticOracle.getCurrentTime();

    const balanceBefore = await usdc.balanceOf(requester.address);

    const bond = hre.ethers.utils.parseUnits("0", await usdc.decimals());

    await internalOptimisticOracle.requestPrice(
      requestTimestamp,
      ancillaryData,
      hre.ethers.utils.parseUnits("20", await usdc.decimals()),
      bond,
      liveness
    );

    // Proposer proposes an answer.
    await internalOptimisticOracle.proposePrice(requestTimestamp, ancillaryData, correctAnswer);

    // Disputer disputes the proposal
    await internalOptimisticOracle.disputePrice(requestTimestamp, ancillaryData);

    // In the meantime simulate a vote in the DVM in which the originally disputed price is accepted.
    const disputedPriceRequest = (await mockOracle.queryFilter(mockOracle.filters.PriceRequestAdded()))[0];
    const tx = await mockOracle.pushPrice(
      disputedPriceRequest.args.identifier,
      disputedPriceRequest.args.time,
      disputedPriceRequest.args.ancillaryData,
      ethers.utils.parseEther("1") // Yes answer
    );
    const receipt = await tx.wait();

    // Set time after liveness
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    await internalOptimisticOracle.setCurrentTime(
      block.timestamp + (await optimisticOracle.defaultLiveness()).toNumber()
    );

    // Dispute is resolved by the DVM
    await internalOptimisticOracle.settleAndGetPrice(requestTimestamp, ancillaryData);

    const storeFinalFee = await store.computeFinalFee(usdc.address);

    const finalCost = storeFinalFee.rawValue.add(bond.div(2));

    expect(finalCost).to.equal(balanceBefore.sub(await usdc.balanceOf(requester.address)));

    expect(finalCost).to.equal(await usdc.balanceOf(store.address));

    expect(await internalOptimisticOracle.getPrice(requestTimestamp, ancillaryData)).to.deep.equal(correctAnswer);

    expect(await usdc.balanceOf(internalOptimisticOracle.address)).to.deep.equal(BigNumber.from(0));
  });
});
