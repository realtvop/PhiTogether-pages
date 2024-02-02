"use strict";

var cacheStorageKey = "PTv0-";

const CORE = ["/"];

self.db = {
  read: (key, config) => {
    if (!config) {
      config = { type: "text" };
    }
    return new Promise((resolve, reject) => {
      caches
        .match(new Request(`https://LOCALCACHE/${encodeURIComponent(key)}`))
        .then(function (res) {
          res.text().then((text) => resolve(text));
        })
        .catch(() => {
          resolve(null);
        });
    });
  },
  write: (key, value) => {
    return new Promise((resolve, reject) => {
      caches
        .open(`${cacheStorageKey}SwDB`)
        .then(function (cache) {
          cache.put(
            new Request(`https://LOCALCACHE/${encodeURIComponent(key)}`),
            new Response(value)
          );
          resolve();
        })
        .catch(() => {
          reject();
        });
    });
  },
};

function parseURL(url) {
  let tmp = url.substr(url.indexOf("//") + 2);
  let host = tmp.substr(0, tmp.indexOf("/"));
  let tmp2 = tmp.substr(tmp.indexOf("/"));
  let qm = tmp2.indexOf("?");
  let path, queryParam;
  if (qm < 0) {
    path = tmp2;
    queryParam = undefined;
  } else {
    path = tmp2.substr(0, qm);
    queryParam = tmp2.substr(qm);
  }

  return {
    path,
    host,
    queryParam,
  };
}

function cacheFirst(request, key) {
  return caches.open(key).then((cache) => {
    return cache.match(request, { ignoreSearch: true, ignoreVary: true }).then((response) => {
      return (
        response ||
                fetch(request).then((response) => {
                  if (response.ok) cache.put(request, response.clone());
                  return response;
                })
      );
    });
  });
}

function cacheOrOnline(request, key) {
  return caches.open(key).then((cache) => {
    return cache.match(request, { ignoreSearch: true, ignoreVary: true }).then((response) => {
      return response || fetch(request);
    });
  });
}

function onlineFirst(request, key) {
  return caches.open(key).then((cache) => {
    const offlineFetch = () => {
      return cache.match(request).then((response) => {
        return response;
      });
    };
    if (!navigator.onLine) return offlineFetch;
    return fetch(request)
      .then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(offlineFetch);
  });
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(cacheStorageKey + "Main").then(function (cache) {
      return cache.addAll(CORE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("fetch", async function (e) {
  const urlParsed = parseURL(e.request.url);
  const urlOri = e.request.url;
  if (urlOri.startsWith("http")) {
    if (urlParsed.queryParam && urlParsed.queryParam.includes("nocacahe=nocache")) {
      e.respondWith(cacheOrOnline(e.request, cacheStorageKey + (urlParsed.queryParam && urlParsed.queryParam.includes("key=Main") ? "Main" : "Charts")));
      return;
    } else if (urlParsed.path.startsWith("/api/")) {
      return;
    } else if (urlParsed.host === "res.phizone.cn" || urlParsed.host === "res.phi.zone" || urlParsed.host === "pzres.uotan.cn" || (urlParsed.path.startsWith("/PTVirtual/")) || (urlParsed.path.startsWith("/src/core/charts/"))) {
      if (urlParsed.path.startsWith("/PTVirtual/db/")) {
        e.respondWith(ptdbfetch(urlParsed.path));
        return;
      }
      if (urlParsed.path.startsWith("/user/") || (urlParsed.path.startsWith("/PTVirtual/user/"))) {
        e.respondWith(cacheFirst(e.request, cacheStorageKey + "User"));
        return;
      }
      e.respondWith(cacheFirst(e.request, cacheStorageKey + "Charts"));
      return;
    } else if (urlParsed.host === "ptc.realtvop.eu.org" || urlParsed.host === "chart.phitogether.fun") {
      if (!urlParsed.path.includes("songs.json") && !urlParsed.path.includes("chapters.json")) e.respondWith(cacheFirst(e.request, cacheStorageKey + "Charts"));
      return;
    } else if (["dev.phizone.cn", "api.phizone.cn", "api.phi.zone", "ud.realtvop.eu.org", "qrcode.realtvop.eu.org", "api.phitogether.realtvop.eu.org"].includes(urlParsed.host) || (urlParsed.host === "proxy.phitogether.fun" && ["phizoneApi", "ud", "qrc", "uai"].includes(urlParsed.path.split("/")[1]))) {
      return;
    } else if (urlParsed.host.endsWith("realtvop.eu.org") && !urlParsed.host.includes("er-vi")) {
      e.respondWith(cacheFirst(e.request, cacheStorageKey + "Res-" + urlParsed.host));
      return;
    } else if (!urlParsed.path.startsWith("/api/")) {
      if (self.location.port === "1145") return;
      if (urlParsed.path.startsWith("/#/")) {
        e.respondWith(cacheFirst("/", cacheStorageKey + "Main"));
        return;
      }
      e.respondWith(cacheFirst(e.request, cacheStorageKey + "Main"));
      return;
    }
  }
  return;
});
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheNames) => {
              return !cacheNames.startsWith(cacheStorageKey);
            })
            .map((cacheNames) => {
              return caches.delete(cacheNames);
            })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});


// from ptdb
async function ptdbfetch(url, meta) {
  if (url.startsWith("/PTVirtual/db/")) {
      const parsedHash = url.slice(14).split("/");
      if (!parsedHash[1]) return await fetch(url);
      if (parsedHash[0] === "chart" || parsedHash[0] === "assets") {
          const chart = await getCachedChart(parsedHash[1])
                          ?.then(r => r)
                          .catch(async e => {
                              if (meta) {
                                  await downloadChart(meta).then(saveCachedChart);
                                  return await getCachedChart(parsedHash[1]);
                              } else return null;
                          });
          if (!chart) return await fetch(url);
          if (parsedHash[0] === "assets") return new Response(chart.assetsFile[parseInt(parsedHash[2]).file], { url: `https://realtvop.sb/${chart.assetsFile[parseInt(parsedHash[2])].name}` });
          else return new Response(chart.chartFile);
      } else if (parsedHash[0] === "song" || parsedHash[0] === "illustration") {
          const song = await getCachedSong(parsedHash[1])
                          ?.then(r => r)
                          .catch(async e => {
                              if (meta) {
                                  await downloadSong(meta).then(saveCachedSong);
                                  return await getCachedSong(parsedHash[1]);
                              } else return null;
                          });
          if (!song) return await fetch(url);
          if (parsedHash[0] === "song") return new Response(song.songFile);
          else return new Response(song.illustrationFile);
      } else if (parsedHash[0] === "skin") {
        
      } else return await fetch(url);
  } else return await fetch(url);
}
function getCachedChart(id) {
  if (id === null) return null;
  return new Promise((res, rej) => {
      openDB()
          .then(db => {
              const objStore = db.transaction(['chart']).objectStore('chart');
              const getReq = objStore.get(id);
              getReq.onsuccess = e => {
                  const result = getReq.result;
                  if (result) res(result)
                  else rej(e);
              };
              getReq.onerror = e => rej(e);
          })
          .catch(e => rej(e));
  });
}
function getCachedSong(id) {
  if (id === null) return null;
  return new Promise((res, rej) => {
      openDB()
          .then(db => {
              const objStore = db.transaction(['song']).objectStore('song');
              const getReq = objStore.get(id);
              getReq.onsuccess = e => {
                  const result = getReq.result;
                  if (result) res(result)
                  else rej(e);
              };
              getReq.onerror = e => rej(e);
          })
          .catch(e => rej(e));
  });
}

function saveCachedSong(cachedSong) {
  return new Promise((res, rej) => {
      openDB()
          .then(db => {
              const objStore = db.transaction(['song'], 'readwrite').objectStore('song');
              const getReq = objStore.get(cachedSong.id);
              getReq.onsuccess = e => {
                  if (getReq.result) objStore.put(cachedSong);
                  else objStore.add(cachedSong);
                  res(true);
              };
              getReq.onerror = e => rej(e);
          })
          .catch(e => rej(e));
      });
}
function saveCachedChart(cachedChart) {
  return new Promise((res, rej) => {
      openDB()
          .then(db => {
              const objStore = db.transaction(['chart'], 'readwrite').objectStore('chart');
              const getReq = objStore.get(cachedChart.id);
              getReq.onsuccess = e => {
                  if (getReq.result) objStore.put(cachedChart);
                  else objStore.add(cachedChart);
                  res(true);
              };
              getReq.onerror = e => rej(e);
          })
          .catch(e => rej(e));
      });
}

const openedDB = {};
function openDB(dbName = "PTv0", ver = 1) {
    return new Promise((res, rej) => {
      if (openedDB[dbName]) return res(openedDB[dbName]);
      if (!self.indexedDB) rej("IndexedDB Not Found");
      const req = self.indexedDB.open(dbName, ver);
      req.onerror = e => rej(e);
      req.onsuccess = e => res(openedDB[dbName] = req.result);
      req.onupgradeneeded = e => rej(false);
    });
}