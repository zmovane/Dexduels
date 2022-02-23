import BigNumber from "bignumber.js";
import { parseUnits } from "@ethersproject/units";
import {
  mainnet,
  abis,
  Dex,
  tokens,
  wallet,
  gasPrice,
  web3,
  newContract,
} from "./base.js";
import {
  computePairAddress,
  Pair,
  CurrencyAmount,
  Trade,
  JSBI,
  Token,
  ChainId,
  Router,
  SmartBCH,
} from "@mistswapdex/sdk";

class Mistswap extends Dex {
  SMARTBCH = SmartBCH.onChain(ChainId.SMARTBCH);
  routerContract = newContract(abis.mistswapRouter, mainnet.mistswap.router);

  async getQuotes([symIn, symOut], baseAmount) {
    const tokenIn = this._asToken(symIn);
    const tokenOut = this._asToken(symOut);
    const bid = await this._getOutputAmount(
      tokenIn,
      tokenOut,
      baseAmount,
      true
    );

    const ask = await this._getOutputAmount(
      tokenOut,
      tokenIn,
      baseAmount,
      false
    );
    return [new BigNumber(bid), new BigNumber(ask)];
  }

  async _getOutputAmount(tokenIn, tokenOut, amount, isExactIn = true) {
    const trade = await this._trade(tokenIn, tokenOut, amount, isExactIn);
    return (isExactIn ? trade.outputAmount : trade.inputAmount).toSignificant(
      6
    );
  }

  async swap(symIn, symOut, amountIn, amountOut) {
    const isExactIn = amountIn !== undefined && amountOut === undefined;
    const tokenIn = this._asToken(symIn);
    const tokenOut = this._asToken(symOut);
    const trade = await this._trade(
      tokenIn,
      tokenOut,
      amountIn || amountOut,
      isExactIn
    );
    const { methodName, args, value } = Router.swapCallParameters(
      trade,
      this.DEFAULT_SWAP_OPTIONS
    );
    const data = this.routerContract.methods[methodName](...args).encodeABI();
    const tx = {
      from: wallet,
      to: this.routerContract.options.address,
      data: data,
      value: value,
    };
    tx.gas = await web3.eth.estimateGas(tx);
    tx.gasPrice = gasPrice;
    return await web3.eth.sendTransaction(tx);
  }

  async _trade(
    tokenIn,
    tokenOut,
    amount,
    isExactIn,
    { maxHops } = this.TRADES_OPTIONS
  ) {
    const allowedPairs = await this._pairs(tokenIn, tokenOut);

    tokenIn = this._isEther(tokenIn) ? this.SMARTBCH : tokenIn;
    tokenOut = this._isEther(tokenOut) ? this.SMARTBCH : tokenOut;

    const parsedAmount = this._parseAmount(
      amount.toString(),
      isExactIn ? tokenIn : tokenOut
    );

    if (maxHops === 1) {
      return this._bestTrades(
        allowedPairs,
        tokenIn,
        tokenOut,
        parsedAmount,
        isExactIn,
        {
          maxHops: 1,
          maxNumResults: 1,
        }
      )[0];
    }
    // search through trades with varying hops, find best trade out of them
    let bestTradeSoFar;
    for (let i = 1; i <= maxHops; i++) {
      const currentTrade = this._bestTrades(
        allowedPairs,
        tokenIn,
        tokenOut,
        parsedAmount,
        isExactIn,
        {
          maxHops: i,
          maxNumResults: 1,
        }
      )[0];
      if (
        this._isTradeBetter(
          bestTradeSoFar,
          currentTrade,
          this.BETTER_TRADE_LESS_HOPS_THRESHOLD
        )
      ) {
        bestTradeSoFar = currentTrade;
      }
    }
    return bestTradeSoFar;
  }

  _isTradeBetter(tradeA, tradeB, minimumDelta = this.ZERO_PERCENT) {
    if (tradeA && !tradeB) return false;
    if (tradeB && !tradeA) return true;
    if (!tradeA || !tradeB) return undefined;

    if (
      tradeA.tradeType !== tradeB.tradeType ||
      !tradeA.inputAmount.currency.equals(tradeB.inputAmount.currency) ||
      !tradeB.outputAmount.currency.equals(tradeB.outputAmount.currency)
    ) {
      throw new Error("Comparing incomparable trades");
    }

    if (minimumDelta.equalTo(this.ZERO_PERCENT)) {
      return tradeA.executionPrice.lessThan(tradeB.executionPrice);
    } else {
      return tradeA.executionPrice.asFraction
        .multiply(minimumDelta.add(this.ONE_HUNDRED_PERCENT))
        .lessThan(tradeB.executionPrice);
    }
  }

  _bestTrades(
    allowedPairs,
    tokenIn,
    tokenOut,
    parsedAmount,
    isExactIn,
    options
  ) {
    return isExactIn
      ? Trade.bestTradeExactIn(allowedPairs, parsedAmount, tokenOut, options)
      : Trade.bestTradeExactOut(allowedPairs, tokenIn, parsedAmount, options);
  }

  async _pairs(token0, token1) {
    return (
      await Promise.all(
        this._currencyCombinations(token0.symbol, token1.symbol).map(
          async ([token0, token1]) => {
            return await this._pairOf(token0, token1);
          }
        )
      )
    ).filter((pair) => pair !== undefined);
  }

  async _pairOf(token0, token1) {
    const pairAddress = this._getPairAddress(token0, token1);
    const contract = newContract(abis.uniswapV2Pair, pairAddress);
    [token0, token1] = token0.sortsBefore(token1)
      ? [token0, token1]
      : [token1, token0];

    return contract.methods
      .getReserves()
      .call()
      .then((reserves) => {
        return new Pair(
          CurrencyAmount.fromRawAmount(token0, reserves.reserve0.toString()),
          CurrencyAmount.fromRawAmount(token1, reserves.reserve1.toString())
        );
      })
      .catch(() => {
        return undefined;
      });
  }

  _getPairAddress(tokenA, tokenB) {
    return computePairAddress({
      factoryAddress: mainnet.mistswap.factory,
      tokenA,
      tokenB,
    });
  }

  _parseAmount(amount, tokenIn) {
    const parsedAmount = parseUnits(amount, tokenIn.decimals).toString();
    return CurrencyAmount.fromRawAmount(tokenIn, JSBI.BigInt(parsedAmount));
  }

  _asToken(symbol) {
    const json = tokens[symbol];
    return new Token(
      ChainId.SMARTBCH,
      json.address,
      json.decimals,
      json.symbol,
      json.name
    );
  }

  _isEther(token) {
    return token.symbol === "WBCH";
  }

  _currencyCombinations(
    sym0,
    sym1,
    basesToCheckTradesAgainst = ["WBCH", "flexUSD"]
  ) {
    return super
      ._currencyCombinations(sym0, sym1, basesToCheckTradesAgainst)
      .map(([tokenJson0, tokenJson1]) => [
        this._asToken(tokenJson0),
        this._asToken(tokenJson1),
      ])
      .filter(([token0, token1]) => !token0.equals(token1));
  }
}

export default Mistswap;
