const GlobalScaleMode = {
  _globalScaleModeEnabled: false,
  enableGlobalScaleMode() {
    this._globalScaleModeEnabled = true;
    const layers = L.PM.Utils.findLayers(this.map).filter(
      (l) => l instanceof L.Polyline
    );
    layers.forEach((layer) => {
      if (this._isRelevantScale(layer)) {
        layer.pm.enableScale();
      }
    });

    if (!this.throttledReInitRotate) {
      this.throttledReInitRotate = L.Util.throttle(
        this._reinitGlobalScaleMode,
        100,
        this
      );
    }
    // handle layers that are added while in rotate mode
    this.map.on('layeradd', this.throttledReInitRotate, this);

    // toogle the button in the toolbar if this is called programatically
    this.Toolbar.toggleButton('scaleMode', this.globalScaleModeEnabled());
    this._fireGlobalScaleModeToggled();
  },
  disableGlobalScaleMode() {
    this._globalScaleModeEnabled = false;
    const layers = L.PM.Utils.findLayers(this.map).filter(
      (l) => l instanceof L.Polyline
    );
    layers.forEach((layer) => {
      layer.pm.disableScale();
    });

    // remove map handler
    this.map.off('layeradd', this.throttledReInitRotate, this);

    // toogle the button in the toolbar if this is called programatically
    this.Toolbar.toggleButton('rotateMode', this.globalScaleModeEnabled());
    this._fireGlobalScaleModeToggled();
  },
  globalScaleModeEnabled() {
    return !!this._globalScaleModeEnabled;
  },
  toggleGlobalScaleMode() {
    if (this.globalScaleModeEnabled()) {
      this.disableGlobalScaleMode();
    } else {
      this.enableGlobalScaleMode();
    }
  },
  _reinitGlobalScaleMode({ layer }) {
    // do nothing if layer is not handled by leaflet so it doesn't fire unnecessarily
    if (!this._isRelevantScale(layer)) {
      return;
    }

    // re-enable global rotation mode if it's enabled already
    if (this.globalScaleModeEnabled()) {
      this.disableGlobalScaleMode();
      this.enableGlobalScaleMode();
    }
  },
  _isRelevantScale(layer) {
    return (
      layer.pm &&
      !(layer instanceof L.LayerGroup) &&
      ((!L.PM.optIn && !layer.options.pmIgnore) || // if optIn is not set / true and pmIgnore is not set / true (default)
        (L.PM.optIn && layer.options.pmIgnore === false)) && // if optIn is true and pmIgnore is false
      !layer._pmTempLayer &&
      layer.pm.options.allowScaling
    );
  },
};
export default GlobalScaleMode;
