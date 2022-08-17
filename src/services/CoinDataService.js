import http from "../http-common";

class CoinDataService {
  create(data) {
    return http.post("/coin/detail", data);
  }
}

export default new CoinDataService();
