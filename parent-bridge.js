// ===== Realium Parent Bridge (Framer top-level page) =====
(() => {
  // --- CONFIG (Sepolia) ---
  const CHAIN_ID = 11155111; // Sepolia
  const SALE_ADDR = "0x3c87689C514EDF1d61d4bCF0EA85fD040507Eef7"; // TokenSale (Sepolia)
  const USDT_ADDR = "0x87A2eA23BfE0c17086C53C692a00Db81a4C316Df"; // MockUSDT (Sepolia)
  const PRICE_PER_TOKEN_USD = "1000"; // 1,000 USDT per token

  // --- Minimal ABIs ---
  const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ];
  const SALE_ABI = [
    "function buyWithUSDT(uint256 amountUSDT) public",
    "function tokenPriceUSD() view returns (uint256)"
  ];

  function postBack(source, origin, type, payload) {
    try { source.postMessage({ type, payload }, origin); } catch {}
  }

  async function getProvider() {
    if (typeof window.ethereum !== "object") {
      throw new Error("MetaMask not found");
    }
    const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== CHAIN_ID) {
      // try polite switch
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }] // 11155111 hex
        });
      } catch {}
      const net2 = await provider.getNetwork();
      if (Number(net2.chainId) !== CHAIN_ID) {
        throw new Error("Wrong network. Please switch to Sepolia.");
      }
    }
    return provider;
  }

  async function doApprove(tokens) {
    const provider = await getProvider();
    const signer = await provider.getSigner();
    const usdt = new ethers.Contract(USDT_ADDR, ERC20_ABI, signer);

    const dec = await usdt.decimals();
    // amountUSDT = tokens * 1000 USDT (with USDT decimals)
    const amountUSDT = ethers.utils.parseUnits(
      (BigInt(tokens) * BigInt(PRICE_PER_TOKEN_USD)).toString(),
      dec
    );
    const tx = await usdt.approve(SALE_ADDR, amountUSDT);
    await tx.wait();
    return { hash: tx.hash };
  }

  async function doBuy(tokens) {
    const provider = await getProvider();
    const signer = await provider.getSigner();
    const usdt = new ethers.Contract(USDT_ADDR, ERC20_ABI, signer);
    const sale = new ethers.Contract(SALE_ADDR, SALE_ABI, signer);

    const dec = await usdt.decimals();
    const amountUSDT = ethers.utils.parseUnits(
      (BigInt(tokens) * BigInt(PRICE_PER_TOKEN_USD)).toString(),
      dec
    );
    const tx = await sale.buyWithUSDT(amountUSDT);
    await tx.wait();
    return { hash: tx.hash };
  }

  window.addEventListener("message", async (ev) => {
    const { data, source, origin } = ev;
    if (!data || !data.type || !source) return;

    try {
      switch (data.type) {
        case "rlm:connect": {
          const provider = await getProvider();
          await provider.send("eth_requestAccounts", []);
          const addr = await provider.getSigner().getAddress();
          postBack(source, origin, "rlm:connected", { address: addr });
          break;
        }
        case "rlm:approve": {
          postBack(source, origin, "rlm:status", { msg: "Approving..." });
          const r = await doApprove(Number(data.payload?.tokens || 1));
          postBack(source, origin, "rlm:approved", r);
          break;
        }
        case "rlm:buy": {
          postBack(source, origin, "rlm:status", { msg: "Buying..." });
          const r = await doBuy(Number(data.payload?.tokens || 1));
          postBack(source, origin, "rlm:bought", r);
          break;
        }
      }
    } catch (e) {
      postBack(source, origin, "rlm:error", { message: e?.message || String(e) });
    }
  });

  console.log("[BRIDGE] ready");
})();
