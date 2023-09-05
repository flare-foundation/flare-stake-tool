import { BN } from '@flarenetwork/flarejs/dist';

const fixtures = {
  getAddValidatorParams: {
    input: {
      nodeID: 'NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg',
      stakeAmount: new BN(100),
      startTime: new BN(10000),
      endTime: new BN(20000),
      delegationFee: 10
    }
  },
  getUnsignedAddValidator: {
      invalidStakeAmount: {
        nodeID: 'NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg',
        stakeAmount: new BN(100),
        startTime: new BN(Date.now() + 100000000),
        endTime: new BN(Date.now() + 500000000),
        delegationFee: 10
      },
      invalidStartTime: {
        nodeID: 'NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg',
        stakeAmount: new BN(2000000000000),
        startTime: new BN(500),
        endTime: new BN(50),
        delegationFee: 10
    },
    insufficientBalance: {
        nodeID: 'NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg',
        stakeAmount: new BN(2000000000000),
        startTime: new BN(Date.now()+1000),
        endTime: new BN(Date.now()+50000),
        delegationFee: 10
    }
  }
};

export default fixtures
