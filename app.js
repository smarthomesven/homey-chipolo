'use strict';

const Homey = require('homey');
const axios = require('axios');

module.exports = class ChipoloApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('MyApp has been initialized');
    this.isBlocked = false;
    this.pollChipolo();
    this.homey.setInterval(() => {
      this.pollChipolo();
    }, 900 * 1000); // Poll every 15 minutes
  }

  async pollChipolo() {
    // Skip polling if we're currently blocked
    if (this.isBlocked) {
      this.log('Polling skipped - currently in cooldown period due to rate limiting');
      return;
    }

    try {
      const token = this.homey.settings.get('chipolo_token');
      const userId = this.homey.settings.get('chipolo_user_id');
      if (!token || !userId) {
        this.log('No Chipolo token found, cannot list devices');
        return [];
      }

      const response = await axios.get(`https://api.chipolo.com/v2/user/${userId}/state`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
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
      
      // Handle 403 Forbidden (Cloudflare block)
      if (error.response?.status === 403) {
        this.log('403 Forbidden detected - likely Cloudflare rate limiting. Pausing polling for 24 hours.');
        await this.handleCloudflareBlock();
        return;
      }
      
      // Handle 401 Unauthorized (token expired)
      if (error.response?.status === 401) {
        this.homey.settings.set('loggedIn', false);
        await this.chipoloLogin();
        this.pollChipolo();
      }
    }
  }

  async handleCloudflareBlock() {
    this.isBlocked = true;
    const blockMessage = "IP block by Cloudflare detected, polling is paused for 24 hours";
    
    // Set all Chipolo devices as unavailable
    try {
      const chipoloDriver = this.homey.drivers.getDriver('chipolo');
      const chipoloDevices = chipoloDriver.getDevices();
      for (const device of chipoloDevices) {
        await device.setUnavailable(blockMessage);
      }
    } catch (error) {
      this.error('Error setting Chipolo devices unavailable:', error);
    }

    // Set all phone devices as unavailable
    try {
      const phoneDriver = this.homey.drivers.getDriver('phone');
      const phoneDevices = phoneDriver.getDevices();
      for (const device of phoneDevices) {
        await device.setUnavailable(blockMessage);
      }
    } catch (error) {
      this.error('Error setting phone devices unavailable:', error);
    }

    // Wait 24 hours before resuming
    this.log('Starting 24-hour cooldown period...');
    setTimeout(async () => {
      this.log('24-hour cooldown period ended, resuming polling...');
      this.isBlocked = false;
      
      // Try to set devices back to available
      try {
        const chipoloDriver = this.homey.drivers.getDriver('chipolo');
        const chipoloDevices = chipoloDriver.getDevices();
        for (const device of chipoloDevices) {
          await device.setAvailable();
        }
      } catch (error) {
        this.error('Error setting Chipolo devices available:', error);
      }

      try {
        const phoneDriver = this.homey.drivers.getDriver('phone');
        const phoneDevices = phoneDriver.getDevices();
        for (const device of phoneDevices) {
          await device.setAvailable();
        }
      } catch (error) {
        this.error('Error setting phone devices available:', error);
      }

      // Resume polling immediately
      this.pollChipolo();
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
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
      return true;
    } catch (error) {
      this.error('Error during login:', error);
    }
  }

};