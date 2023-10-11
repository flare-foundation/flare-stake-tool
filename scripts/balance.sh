#! /bin/bash

for i in {12..30}
  do

   bin/flare-stake-tool info balance  --ctx-file ctx${i}.json

 done
