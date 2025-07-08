const { Web3 } = require('web3'); // Updated import for web3.js 4.x

// Initialize Web3 with an Ethereum provider (e.g., Infura, MetaMask, or local node)
const web3 = new Web3("http://127.0.0.1:9650/ext/bc/C/rpc");

// Sender and receiver addresses
const senderAddress = '0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC'; // e.g., '0xYourSenderAddress'
const receiverAddress = '0xA6520cF1872f6d45FDa462cbEEF10E11EAf0C40C'; // e.g., '0xYourReceiverAddress'
const privateKey = '0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027'; // e.g., '0xYourPrivateKey' (never hardcode in production)

// Amount to send (in ETH)
const amountToSend = "1000000"; // Adjust the amount as needed

async function transferFunds() {
  try {
    // Convert ETH to Wei
    const value = web3.utils.toWei(amountToSend, 'ether');

    // Get the sender's nonce
    const nonce = await web3.eth.getTransactionCount(senderAddress, 'pending');
    console.log(`Nonce for ${senderAddress}: ${nonce}`);

    let gasPrice = await web3.eth.getGasPrice();
    // Create the transaction object
    const txObject = {
      to: receiverAddress,
      value: value,
      gasPrice: gasPrice.toString(),
      gas: 4000000, // Use 21000 for simple transfers; set to 4_000_000 for contract interactions
      nonce: nonce,
      chainId: 162, // LightLink Phoenix Mainnet
      type: '0x0', // Explicitly legacy transaction (hex format)
    };

    // Sign the transaction
    const signedTx = await web3.eth.accounts.signTransaction(txObject, privateKey);

    // Send the signed transaction
    const txReceipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    console.log('Transaction successful!');
    console.log('Transaction Hash:', txReceipt.transactionHash);
    console.log('Block Number:', txReceipt.blockNumber);
    console.log(`Transferred ${amountToSend} ETH from ${senderAddress} to ${receiverAddress}`);
  } catch (error) {
    if (
          error &&
          typeof error === 'object' &&
          "innerError" in error &&
          error.innerError &&
          typeof error.innerError === 'object' &&
          "message" in error.innerError
        ) {
          console.log(error.innerError.message)
        } else if (
          error &&
          typeof error === 'object' &&
          'reason' in error
        ) {
          console.log(error.reason)
        } else {
          console.log(error)
          console.dir(error);
        }
  }
}

// Execute the transfer
transferFunds();