import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [sepolia],

  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],

  transports: {
  [sepolia.id]: http("https://eth-sepolia.g.alchemy.com/v2/AGGplEcMBxml35aGixrjx"),
  },
});
