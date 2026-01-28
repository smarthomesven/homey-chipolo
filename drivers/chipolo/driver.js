'use strict';

const Homey = require('homey');
const axios = require('axios');
const crypto = require("crypto");

module.exports = class ChipoloDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('MyDriver has been initialized');
  }

  async triggerFlow(card_id, device) {
    this.homey.flow.getDeviceTriggerCard(card_id).trigger(device, {}, {});
  }

  async onPair(session) {
    session.setHandler("showView", async (viewId) => {
      if (viewId === 'login') {
        const loggedIn = this.homey.settings.get('loggedIn');
        if (loggedIn) {
          await session.showView('list_devices');
          return;
        }
      }
    });

    session.setHandler('login', async (data) => {
      try {
        // Handle login data here
        this.log('Login data received:', data);
        const response = await axios.post('https://api.chipolo.com/v2/auth/login/chipolo', {
          auth: {
            email: data.email,
            password: data.password
          },
          device: {
            uuid: crypto.randomUUID(),
            push_token: "/",
            os: "web",
            os_version: "1",
            app_version: 2,
            model: "Web Browser",
            lang: "en",
            sandbox: 0,
            ble_enabled: 1,
            hidden: 0,
            battery_level: 100,
            data: {
              name: "Web Browser"
            }
          }
        }, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            'Chipolo-Client-Version': 0,
          },
        });
        if (response.data.session.token) {
          this.homey.settings.set('chipolo_token', response.data.session.token);
          this.homey.settings.set('loggedIn', true);
        }
        if (response.data.session.user_id) {
          this.homey.settings.set('chipolo_user_id', response.data.session.user_id);
        }
        await session.showView('list_devices');
        return true;
      } catch (error) {
        this.error('Error during login:', error);
        return false;
      }
    });

    session.setHandler('list_devices', async () => {
      return this.onPairListDevices();
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    try {
      const token = this.homey.settings.get('chipolo_token');
      const userId = this.homey.settings.get('chipolo_user_id');
      if (!token || !userId) {
        this.log('No Chipolo token found, cannot list devices');
        return [];
      }

      const response = await axios.get('https://api.chipolo.com/v2/user/26053616/state', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
          'Chipolo-Client-Version': 0,
          'Chipolo-Token': token,
          'Chipolo-User-Id': userId,
        },
      });
      return response.data.chipolos.map(device => ({
        name: device.data.name || 'Chipolo',
        data: {
          id: device.mac,
        },
        store: {
          id: device.mac,
        }
      }));
    } catch (error) {
      this.error('Error listing devices:', error);
      return [];
    }
  }

};
