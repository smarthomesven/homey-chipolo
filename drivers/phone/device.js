'use strict';

const Homey = require('homey');
const axios = require('axios');

module.exports = class PhoneDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyDevice has been initialized');
    if (this.hasCapability('measure_battery')) {
      await this.removeCapability('measure_battery');
    }
    if (!this.hasCapability('battery_level')) {
      await this.addCapability('battery_level');
    }
    if (!this.hasCapability('ring')) {
      await this.addCapability('ring');
    }

    this.registerCapabilityListener('ring', async (value) => {
      if (value === true) {
        this.log('Ringing phone:', this.getName());
        try {
          const token = this.homey.settings.get('chipolo_token');
          const userId = this.homey.settings.get('chipolo_user_id');
          if (!token || !userId) {
            this.log('No Chipolo token found, cannot ring phone');
            return;
          }

          await axios.post('https://api.chipolo.com/v2/user/' + userId + '/device/' + this.getData().id + '/push-notification', {
            message: {
              call: "alert",
              message: false
            }
          }, {
            headers: {
              'Chipolo-Client-Version': 0,
              'Chipolo-Token': token,
              'Chipolo-User-Id': userId,
            },
          });
        } catch (error) {
          this.error('Error ringing phone:', error);
        } finally {
          // Reset the ring capability to false after ringing
          setTimeout(async () => {
            await this.setCapabilityValue('ring', false);
          }, 1000);
        }
      }
    });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('MyDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('MyDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('MyDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('MyDevice has been deleted');
  }

};
