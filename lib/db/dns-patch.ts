import dns from "dns";

// Ensure Neon database hosts resolve reliably across all environments and local networks
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  const origLookup = dns.lookup;

  // @ts-ignore
  dns.lookup = function (
    hostname: string,
    options: any,
    callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
  ) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    if (
      hostname &&
      (hostname.includes("neon.tech") || hostname.includes("c-8.us-east-2"))
    ) {
      dns.resolve4(hostname, (err, addresses) => {
        if (!err && addresses && addresses.length > 0) {
          if (options && options.all) {
            return callback(
              null,
              addresses.map((addr) => ({ address: addr, family: 4 }))
            );
          }
          return callback(null, addresses[0], 4);
        }
        return origLookup(hostname, options, callback);
      });
    } else {
      return origLookup(hostname, options, callback);
    }
  };
} catch (e) {
  // Silent fallback if in environments where dns modification is restricted
}
