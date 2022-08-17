<template>
  <div class="container border border-2">
    <div class="modal-body row">
      <div class="col-md-6">
        <label for="basic-url">Amount to Spend</label>
        <div class="border border-primary">
          <b-input-group>
            <b-form-input
              type="number"
              :min="minSpendAmount"
              :max="maxSpendAmount"
              placeholder="Enter Number"
              v-model="spendAmount"
            ></b-form-input>
            <template #append>
              <b-form-select
                v-model="spendSelectedItem"
                :options="spendOptions"
              />
            </template>
          </b-input-group>
        </div>
      </div>
      <div class="col-md-6">
        <label for="basic-url" class="align-baseline">Coins to Receive</label>
        <div class="border border-primary">
          <b-input-group>
            <b-form-input type="number" v-model="receiveCoin"></b-form-input>
            <template #append>
              <b-form-select
                v-model="receiveSelectedItem"
                :options="receiveOptions"
              />
            </template>
          </b-input-group>
        </div>
      </div>
    </div>
    <div
      class="alert alert-warning alert-dismissible fade show"
      role="alert"
      v-if="errors.length"
    >
      <strong>{{ errors[0] }}</strong>
    </div>
    <div class="alert alert-success" role="alert" v-if="info.length">
      <p class="font-weight-normal">Received Coin Amount : {{ info[0] }}</p>
      <p class="font-weight-normal">Date : {{ info[1] }}</p>
      <p class="font-weight-normal">Coin Type : {{ info[2] }}</p>
      <p class="font-weight-normal">Requested Fiat Currency : {{ info[3] }}</p>
      <p class="font-weight-normal">Fiat Amount : {{ info[4] }}</p>
    </div>
  </div>
</template>

<script>
import CoinDataService from "../services/CoinDataService";

export default {
  name: "HomeView",
  components: {},
  mounted: function () {
    this.timer = setInterval(() => {
      if (this.spendAmount != null) {
        this.checkForm();
      }
    }, this.scheduledTimer);
  },

  data() {
    return {
      receiveSelectedItem: "BTC",
      spendSelectedItem: "USD",
      spendOptions: [
        { value: "USD", text: "USD" },
        { value: "EUR", text: "EUR" },
      ],
      receiveOptions: [
        { value: "BTC", text: "BTC" },
        { value: "ETH", text: "ETH" },
      ],
      minSpendAmount: 25,
      maxSpendAmount: 5000,
      spendAmount: null,
      errors: [],
      info: [],
      scheduledTimer: 10000,
      timer: null,
      receiveCoin: null,
    };
  },
  methods: {
    checkForm: function () {
      if (
        this.spendAmount >= this.minSpendAmount &&
        this.spendAmount <= this.maxSpendAmount
      ) {
        this.info = [];
        this.errors = [];
        this.callConvertCoinCalculate();
        return true;
      }
      this.errors = [];
      this.info = [];
      if (!this.name) {
        this.receiveCoin = null;
        this.errors.push(
          "The expense amount was entered incorrectly. Please check!"
        );
      }
    },
    callConvertCoinCalculate: function () {
      var data = {
        spendSymbol: this.spendSelectedItem,
        receiveSymbol: this.receiveSelectedItem,
        spendAmount: this.spendAmount,
      };
      CoinDataService.create(data)
        .then((response) => {
          this.receiveCoin = response.data.receiveCoin;
          this.info.push(this.receiveCoin);
          this.info.push(response.data.receiveCoinDate);
          this.info.push(this.receiveSelectedItem);
          this.info.push(this.spendSelectedItem);
          this.info.push(this.spendAmount);
        })
        .catch((e2) => {
          alert(e2);
        });
    },
  },
};
</script>
