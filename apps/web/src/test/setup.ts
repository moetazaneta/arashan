// jsdom lays nothing out and has no `scrollTo`, which the router's scroll restoration calls on each
// navigation.
if (typeof window !== "undefined") window.scrollTo = () => {};
