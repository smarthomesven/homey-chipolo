'use strict';

const Homey = require('homey');
const axios = require('axios');

module.exports = class ChipoloApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('MyApp has been initialized');
    this.pollChipolo();
    this.homey.setInterval(() => {
      this.pollChipolo();
    }, 30000); // Poll every minute
  }

  async pollChipolo() {
    try {
      const token = this.homey.settings.get('chipolo_token');
      const userId = this.homey.settings.get('chipolo_user_id');
      if (!token || !userId) {
        this.log('No Chipolo token found, cannot list devices');
        return [];
      }

      const response = await axios.get('https://api.chipolo.com/v2/user/26053616/state', {
        headers: {
          'Chipolo-Client-Version': 0,
          'Chipolo-Token': token,
          'Chipolo-User-Id': userId,
        },
      });
      for (const device of response.data.chipolos) {
        const deviceInstance = this.homey.drivers.getDriver('chipolo').getDevice({ id: device.mac });
        if (deviceInstance) {
          let disconnected;
          if (device.ble_connected === 1) {
            disconnected = false;
          } else {
            disconnected = true;
          }
          if (deviceInstance && (disconnected !== deviceInstance.getCapabilityValue('alarm_disconnected'))) {
            await deviceInstance.setCapabilityValue('alarm_disconnected', disconnected);
            if (device.data.ble_connected === 1) {
              this.homey.drivers.getDriver('chipolo').triggerFlow('connected', deviceInstance);
            } else {
              this.homey.drivers.getDriver('chipolo').triggerFlow('disconnected', deviceInstance);
            }
          }
          await deviceInstance.setCapabilityValue('alarm_battery', (device.data.battery_low === 1 || device.data.battery_empty === 1) ? true : false);
        }
      }
      for (const device of response.data.devices) {
        const deviceInstance = this.homey.drivers.getDriver('phone').getDevice({ id: device.id });
        await deviceInstance.setCapabilityValue('battery_level', device.battery_level);
      }
    } catch (error) {
      this.error('Error listing devices:', error);
      if (error.response?.status === 401) {
        this.homey.settings.set('loggedIn', false);
        await this.chipoloLogin();
        this.pollChipolo();
      }
    }
  }

  async chipoloLogin() {
    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');
    if (!email || !password) {
      this.error('No email or password stored, cannot login');
      return;
    }
    try {
      const response = await axios.post('https://api.chipolo.com/v2/auth/login/chipolo', {
        auth: {
          email: email,
          password: password
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
      return true;
    } catch (error) {
      this.error('Error during login:', error);
    }
  }

};
