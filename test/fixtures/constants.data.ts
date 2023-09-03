const fixtures = {
  readContextFile: {
    valid: {
      publicKey: 'dummy-public-key',
      network: 'localflare',
      flareAddress: 'flare-test-address',
      ethAddress: 'eth-dummy-address',
      vaultId: 'abcd'
    },
    invalid: {
      invalidKey: 'value'
    }
  },
  context: {
    valid: {
      networkConfig: {
        protocol: 'http',
        ip: 'localhost',
        port: 9650,
        networkID: 162,
        hrp: 'localflare'
      },
      publicKey:
        '04423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded6720e3335d1110c112c6d1c17fcbb23b9acc29ae5750a27637d385991af15190',
      privkHex: '88b3cf6b7e9ef18a508209d61311a376bde77be5d069449b1eace71130f8252c',
      privkCB58: '23CsygWK55DboL9Tq4KazZDjWi5gAernmEFD9NGJYZfB6VXTfc',
      cAddressHex: '0xfa32c77aa014584bb9c3f69d8d1d74b8844e1a92',
      cAddressBech32: 'C-localflare13dyerwvff59zeazeqejsfs0skadkvsj6x79tqt',
      pAddressBech32: 'P-localflare13dyerwvff59zeazeqejsfs0skadkvsj6x79tqt'
    },
    invalid: {
      networkConfig: {
        protocol: 'http',
        ip: 'localhost',
        port: 9650,
        networkID: 162,
        hrp: 'localflare'
      },
      publicKey:
        '04423fb5371af0e80750a6481bf9b4adcf2cde38786c4e613855b4f629f8c45ded6720e3335d1110c112c6d1c17fcbb23b9acc29ae5750a27637d385991af15190',
      privkHex: 'invalid-private-key-hex',
      privkCB58: '23CsygWK55DboL9Tq4KazZDjWi5gAernmEFD9NGJYZfB6VXTfc',
      cAddressHex: '0xfa32c77aa014584bb9c3f69d8d1d74b8844e1a92',
      cAddressBech32: 'C-localflare13dyerwvff59zeazeqejsfs0skadkvsj6x79tqt',
      pAddressBech32: 'P-localflare13dyerwvff59zeazeqejsfs0skadkvsj6x79tqt'
    }
  }
};
export default fixtures;
