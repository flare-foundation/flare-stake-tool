import { BN } from '@flarenetwork/flarejs/dist';

const fixtures = {
  getAddDelegatorParams: {
    input: {
      nodeID: 'NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg',
      stakeAmount: new BN(100),
      startTime: new BN(10000),
      endTime: new BN(20000)
    }
  },
  getUnsignedAddDelegator: {
    invalidStake: {
      nodeID: 'NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg',
      stakeAmount: new BN(100),
      startTime: new BN(Date.now() + 100000000),
      endTime: new BN(Date.now() + 500000000)
    },
    invalidStartTime: {
        nodeID: 'NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg',
        stakeAmount: new BN(25000000000),
        startTime: new BN(500),
        endTime: new BN(50)
    },
    insufficientBalance: {
        nodeID: 'NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg',
        stakeAmount: new BN(25000000000),
        startTime: new BN(Date.now()+1000),
        endTime: new BN(Date.now()+50000)
    }
  }
};

export default fixtures;
