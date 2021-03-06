const Web3 = require('web3');
const {ZeroEx} = require('0x.js');
const BigNumber = require('bignumber.js');

// Provider pointing to local TestRPC on default port 8545
const provider = new Web3.providers.HttpProvider('http://localhost:8545');

// Instantiate 0x.js instance
const zeroEx = new ZeroEx(provider);

// Number of decimals to use (for ETH and ZRX)
const DECIMALS = 18;

const mainAsync = async () => {

    // Addresses
    const WETH_ADDRESS = await zeroEx.etherToken.getContractAddressAsync(); // The wrapped ETH token contract
    const ZRX_ADDRESS = await zeroEx.exchange.getZRXTokenAddressAsync(); // The ZRX token contract
    // The Exchange.sol address (0x exchange smart contract)
    const EXCHANGE_ADDRESS = await zeroEx.exchange.getContractAddressAsync();

    // Getting list of accounts
    const accounts = await zeroEx.getAvailableAddressesAsync();
    console.log('accounts: ', accounts);

    // Set our addresses
    const [makerAddress, takerAddress] = accounts;

    // Unlimited allowances to 0x proxy contract for maker and taker
    const setMakerAllowTxHash = await zeroEx.token.setUnlimitedProxyAllowanceAsync(ZRX_ADDRESS,  makerAddress);
    await zeroEx.awaitTransactionMinedAsync(setMakerAllowTxHash);
    console.log('Maker allowance mined...');

    const setTakerAllowTxHash = await zeroEx.token.setUnlimitedProxyAllowanceAsync(WETH_ADDRESS, takerAddress);
    await zeroEx.awaitTransactionMinedAsync(setTakerAllowTxHash);
    console.log('Taker allowance mined...');

    // Deposit WETH
    const ethAmount = new BigNumber(1);
    const ethToConvert = ZeroEx.toBaseUnitAmount(ethAmount, DECIMALS); // Number of ETH to convert to WETH

    const convertEthTxHash = await zeroEx.etherToken.depositAsync(ethToConvert, takerAddress);
    await zeroEx.awaitTransactionMinedAsync(convertEthTxHash);
    console.log(`${ethAmount} ETH -> WETH conversion mined...`);

    // Generate order
    const order = {
        maker: makerAddress,
        taker: ZeroEx.NULL_ADDRESS,
        feeRecipient: ZeroEx.NULL_ADDRESS,
        makerTokenAddress: ZRX_ADDRESS,
        takerTokenAddress: WETH_ADDRESS,
        exchangeContractAddress: EXCHANGE_ADDRESS,
        salt: ZeroEx.generatePseudoRandomSalt(),
        makerFee: new BigNumber(0),
        takerFee: new BigNumber(0),
        makerTokenAmount: ZeroEx.toBaseUnitAmount(new BigNumber(0.2), DECIMALS),  // Base 18 decimals
        takerTokenAmount: ZeroEx.toBaseUnitAmount(new BigNumber(0.3), DECIMALS),  // Base 18 decimals
        expirationUnixTimestampSec: new BigNumber(Date.now() + 3600000),          // Valid for up to an hour
    };

    // Create orderHash
    const orderHash = ZeroEx.getOrderHashHex(order);

    // Signing orderHash -> ecSignature
    const ecSignature = await zeroEx.signOrderHashAsync(orderHash, makerAddress);

    // Appending signature to order
    const signedOrder = {
        ...order,
        ecSignature,
    };

    // Verify that order is fillable
    await zeroEx.exchange.validateOrderFillableOrThrowAsync(signedOrder);

    // Try to fill order
    const shouldThrowOnInsufficientBalanceOrAllowance = true;
    const fillTakerTokenAmount = ZeroEx.toBaseUnitAmount(new BigNumber(0.1), DECIMALS);

    // Filling order
    const txHash = await zeroEx.exchange.fillOrderAsync(
        signedOrder, fillTakerTokenAmount, shouldThrowOnInsufficientBalanceOrAllowance, takerAddress,
    );

    // Transaction receipt
    const txReceipt = await zeroEx.awaitTransactionMinedAsync(txHash);
    console.log('FillOrder transaction receipt: ', txReceipt);
};

mainAsync().catch(err => console.log);
