const { expect } = require("chai");
const { ethers } = require("hardhat");

const DAY = 24 * 60 * 60;

async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
}

describe("BitcoinAutonomousWill", function () {

    let will, owner, heir1, heir2, heir3, stranger;

    // Use BTC-style addresses for heirs
    const BTC_ADDR_1 = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
    const BTC_ADDR_2 = "tb1qrp33g0q5b5698ahp5jnf0y5pnhyw7sl0e5n5z8";
    const BTC_ADDR_3 = "tb1q0kxm6ks0cp5zy59t2dmdqm9ccvdf4kxxh2g7y3";

    const heirs = (btc1, btc2) => ([
        { btcAddress: btc1, percentage: 60 },
        { btcAddress: btc2, percentage: 40 },
    ]);

    beforeEach(async () => {
        [owner, heir1, heir2, heir3, stranger] = await ethers.getSigners();

        const Contract = await ethers.getContractFactory("BitcoinAutonomousWill");
        will = await Contract.deploy();
        await will.waitForDeployment();
    });

    /* ------------------------------------------------------------ */
    /*                       CREATE VAULT                           */
    /* ------------------------------------------------------------ */

    it("creates vault successfully", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            30,
            ethers.encodeBytes32String("secret"),
            { value: ethers.parseEther("1") }
        );

        const status = await will.getStatus(owner.address);
        expect(status.active).to.equal(true);
        expect(status.balance).to.equal(ethers.parseEther("1"));
    });

    it("rejects zero deposit", async () => {
        await expect(
            will.connect(owner).createVault(heirs(BTC_ADDR_1, BTC_ADDR_2), 30, "0x")
        ).to.be.reverted;
    });

    it("rejects empty BTC address", async () => {
        await expect(
            will.connect(owner).createVault(
                [{ btcAddress: "", percentage: 100 }],
                30,
                "0x11",
                { value: ethers.parseEther("1") }
            )
        ).to.be.reverted;
    });

    /* ------------------------------------------------------------ */
    /*                       CHECK-IN LOGIC                         */
    /* ------------------------------------------------------------ */

    it("allows check-in after cooldown", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            30,
            "0x11",
            { value: ethers.parseEther("1") }
        );

        await increaseTime(3600 + 1);
        await will.connect(owner).checkIn();
    });

    it("blocks early check-in", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            30,
            "0x11",
            { value: ethers.parseEther("1") }
        );

        await expect(will.connect(owner).checkIn()).to.be.reverted;
    });

    /* ------------------------------------------------------------ */
    /*                        CANCEL FLOW                           */
    /* ------------------------------------------------------------ */

    it("owner can cancel before expiry", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            30,
            "0x11",
            { value: ethers.parseEther("1") }
        );

        await will.connect(owner).cancelVault();
        const status = await will.getStatus(owner.address);

        expect(status.exists).to.equal(false);
    });

    /* ------------------------------------------------------------ */
    /*                     INHERITANCE FLOW                         */
    /* ------------------------------------------------------------ */

    it("heir claims after expiry using BTC address", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            1,
            "0x11",
            { value: ethers.parseEther("1") }
        );

        await increaseTime(DAY + 360);

        // Heir1 claims by passing their BTC address
        await will.connect(heir1).claimInheritance(owner.address, BTC_ADDR_1);

        const pending1 = await will.getPendingWithdrawal(BTC_ADDR_1);
        const pending2 = await will.getPendingWithdrawal(BTC_ADDR_2);

        expect(pending1).to.equal(ethers.parseEther("0.6"));
        expect(pending2).to.equal(ethers.parseEther("0.4"));
    });

    it("rejects claim with wrong BTC address", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            1,
            "0x11",
            { value: ethers.parseEther("1") }
        );

        await increaseTime(DAY + 360);

        // Stranger uses a BTC address not in heirs list
        await expect(
            will.connect(stranger).claimInheritance(owner.address, BTC_ADDR_3)
        ).to.be.reverted;
    });

    /* ------------------------------------------------------------ */
    /*                        WITHDRAW FLOW                         */
    /* ------------------------------------------------------------ */

    it("heir withdraws funds by BTC address", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            1,
            "0x11",
            { value: ethers.parseEther("1") }
        );

        await increaseTime(DAY + 360);
        await will.connect(heir1).claimInheritance(owner.address, BTC_ADDR_1);

        const before = await ethers.provider.getBalance(heir1.address);
        // Heir1 withdraws by providing their BTC address
        await will.connect(heir1).withdraw(BTC_ADDR_1);
        const after = await ethers.provider.getBalance(heir1.address);

        expect(after).to.be.gt(before);
    });

    /* ------------------------------------------------------------ */
    /*                         REVIVE FLOW                          */
    /* ------------------------------------------------------------ */

    it("owner revives after expiry", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            1,
            "0x11",
            { value: ethers.parseEther("1") }
        );

        await increaseTime(DAY + 360);
        await will.connect(owner).revive({ value: ethers.parseEther("0.5") });

        const status = await will.getStatus(owner.address);
        expect(status.active).to.equal(true);
        expect(status.balance).to.equal(ethers.parseEther("1.5"));
    });

    /* ------------------------------------------------------------ */
    /*                        MESSAGE REVEAL                        */
    /* ------------------------------------------------------------ */

    it("heirs can reveal message after claim", async () => {
        const msg = ethers.toUtf8Bytes("hello heirs");

        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            1,
            msg,
            { value: ethers.parseEther("1") }
        );

        await increaseTime(DAY + 360);
        await will.connect(heir1).claimInheritance(owner.address, BTC_ADDR_1);

        // Reveal using BTC address
        await will.connect(heir1).revealMessage(owner.address, BTC_ADDR_1);
    });

    it("non-heir cannot reveal message", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            1,
            "0x11",
            { value: ethers.parseEther("1") }
        );

        await increaseTime(DAY + 360);
        await will.connect(heir1).claimInheritance(owner.address, BTC_ADDR_1);

        await expect(
            will.connect(stranger).revealMessage(owner.address, BTC_ADDR_3)
        ).to.be.reverted;
    });

    /* ------------------------------------------------------------ */
    /*                       VIEW FUNCTIONS                         */
    /* ------------------------------------------------------------ */

    it("getHeirs returns BTC addresses", async () => {
        await will.connect(owner).createVault(
            heirs(BTC_ADDR_1, BTC_ADDR_2),
            30,
            "0x11",
            { value: ethers.parseEther("1") }
        );

        const heirsList = await will.getHeirs(owner.address);
        expect(heirsList[0].btcAddress).to.equal(BTC_ADDR_1);
        expect(heirsList[1].btcAddress).to.equal(BTC_ADDR_2);
        expect(heirsList[0].percentage).to.equal(60);
    });
});
