import Axios from "axios";

export default Axios.create({
  baseURL: "http://localhost:8088/api",
  headers: {
    "Content-Type": "application/json",
  },
});
