import Vue from "vue";
import VueRouter from "vue-router";

Vue.use(VueRouter);

export default new VueRouter({
  mode: "history",
  routes: [
    {
      path: "/",
      base: process.env.BASE_URL,
      name: "home",
      component: () => import("../views/HomeView.vue"),
    },
  ],
});
