const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

class AuthManager {
  constructor() {
    this.user = null;
    this._loginCallbacks = [];
  }

  async init() {
    await this._waitForGSI();
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => this._handleCredential(response),
      auto_select: false,
      cancel_on_tap_outside: false,
    });
  }

  renderButton(element) {
    window.google.accounts.id.renderButton(element, {
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      width: 280,
    });
  }

  onLogin(cb) {
    this._loginCallbacks.push(cb);
  }

  loginAsGuest() {
    // Persist a guest ID in localStorage so the same session survives page refreshes and game restarts
    let guestId = localStorage.getItem('gc_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('gc_guest_id', guestId);
    }
    this.user = { name: 'Guest', email: null, picture: null, isGuest: true, sub: guestId };
    this._loginCallbacks.forEach((cb) => cb(this.user));
  }

  // Returns a stable identifier that survives scene restarts and page refreshes.
  // Google users → 'google:<sub>'. Guests → 'guest:<localStorage id>'.
  getStableId() {
    if (!this.user) return null;
    return this.user.isGuest
      ? `guest:${this.user.sub}`
      : `google:${this.user.sub}`;
  }

  isLoggedIn() {
    return this.user !== null;
  }

  isGuest() {
    return this.user?.isGuest === true;
  }

  logout() {
    if (this.user?.email) {
      window.google.accounts.id.revoke(this.user.email, () => {});
    }
    this.user = null;
  }

  _handleCredential(response) {
    try {
      const [, payload] = response.credential.split('.');
      const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
      const data = JSON.parse(atob(padded));
      this.user = { name: data.name, email: data.email, picture: data.picture, sub: data.sub };
      this._loginCallbacks.forEach((cb) => cb(this.user));
    } catch {
      document.getElementById('auth-error')?.classList.add('visible');
    }
  }

  _waitForGSI() {
    return new Promise((resolve) => {
      if (window.google?.accounts?.id) { resolve(); return; }
      const iv = setInterval(() => {
        if (window.google?.accounts?.id) { clearInterval(iv); resolve(); }
      }, 100);
    });
  }
}

export default new AuthManager();
