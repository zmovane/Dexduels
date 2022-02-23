import "../setup-env.js"
import WebSocket from "ws";
import url from "url";
import HttpsProxyAgent from "https-proxy-agent";

const timestamp = () =>
  new Date().toISOString().replace("T", " ").substr(0, 19);
const proxy = process.env.HTTP_PROXY;
const options = url.parse(proxy);
const agent = new HttpsProxyAgent(options);

function WebSocketClient(url) {
  const minBackoff = 250;
  const maxBackoff = 8000;
  let client;
  let timeout;
  let backoff = minBackoff;

  const reconnect = () => {
    backoff = backoff >= maxBackoff ? minBackoff : backoff * 2;
    setTimeout(() => init(), backoff);
  };

  const init = () => {
    console.info(timestamp(), "WebSocketClient :: connecting");
    if (client !== undefined) {
      client.removeAllListeners();
    }
    client = new WebSocket(url, { agent: agent });
    const heartbeat = () => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      timeout = setTimeout(() => client.terminate(), 35000);
    };
    client.on("ping", () => {
      console.log(timestamp(), "WebSocketClient :: pinged");
      heartbeat();
    });
    client.on("open", (e) => {
      if (typeof this.onOpen === "function") {
        this.onOpen();
      } else {
        console.log(timestamp(), "WebSocketClient :: opened");
        console.log(e);
      }
      heartbeat();
    });
    client.on("message", (e) => {
      if (typeof this.onMessage === "function") {
        this.onMessage(e);
      } else {
        console.log(timestamp(), "WebSocketClient :: messaged");
      }
      heartbeat();
    });
    client.on("close", (code, _) => {
      switch (code) {
        case 1000:
          console.log("WebSocket: closed");
          if (typeof this.onClose === "function") {
            this.onClose();
          }
          break;
        case 1006:
          console.log("WebSocket: closed abnormally");
          reconnect();
          break;
        default:
          console.log("WebSocket: closed unknown");
          reconnect();
          break;
      }
    });
    client.on("error", (e) => {
      if (e.code === "ECONREFUSED") {
        reconnect();
      } else if (typeof this.onError === "function") {
        this.onError(e);
      } else {
        console.error(timestamp(), "WebSocketClient :: errored");
        console.error(e);
      }
    });
    this.send = client.send.bind(client);
    this.close = client.close.bind(client);
  };
  init();
}

export default WebSocketClient;
