import get from 'lodash/get';
import { _convertLatLngs, _toPoint } from '../helpers/ModeHelper';
import { copyLatLngs } from '../helpers';

/**
 * We create a temporary polygon with the same latlngs as the layer that we want to scale.
 * Why polygon? Because then we have the correct center also for polylines with `layer.getCenter()`.
 * We reference the origin layer as `_scaledLayer`. The scale listeners (`_onScale...()`) are only applied to the temp polygon and from there we need to rotate the `_scaleLayer` too.
 *
 */

const ScaleMixin = {
  _onScaleStart(e) {
    this._preventRenderingMarkers(true)
    this._scaleOriginLatLng = this._getScaleCenter().clone()
    this._ratio = 1
    this._scaleOriginPoint = _toPoint(this._map, this._scaleOriginLatLng)
    this._scaleStartPoint = _toPoint(this._map, e.target.getLatLng())
    this._initialDistance = this._scaleOriginPoint.distanceTo(this._scaleStartPoint)
    // we need to store the initial latlngs so we can always re-calc from the origin latlngs
    this._initialScaleLatLng = copyLatLngs(this._layer);
    this._initialScaleBoundingBoxLatLng = copyLatLngs(this._rect);

    const originLatLngs = copyLatLngs(
      this._scaledLayer,
      this._scaledLayer.pm._scaleOrgLatLng
    );

    this._fireScaleStart(this._scaledLayer, originLatLngs);
    this._fireScaleStart(this._map, originLatLngs);
  },
  _onScale(e) {
    const position = _toPoint(this._map, e.target.getLatLng());
    // const previous = this._scaleStartPoint;
    const origin = this._scaleOriginPoint;

    // calculate scale ratio
    this._ratio = origin.distanceTo(position) / this._initialDistance
    // scale the temp polygon
    this._layer.setLatLngs(
      this._scaleLayer(
        this._ratio,
        this._initialScaleLatLng,
        this._scaleOriginLatLng,
        L.PM.Matrix.init(),
        this._map
      )
    );
    this._rect.setLatLngs(
      this._scaleLayer(
        this._ratio,
        this._initialScaleBoundingBoxLatLng,
        this._scaleOriginLatLng,
        L.PM.Matrix.init(),
        this._map
      )
    )
    // move the helper markers
    const that = this;
    function forEachLatLng(latlng, path = [], _i = -1) {
      if (_i > -1) {
        path.push(_i);
      }
      if (L.Util.isArray(latlng[0])) {
        latlng.forEach((x, i) => forEachLatLng(x, path.slice(), i));
      } else {
        latlng.forEach((_latlng, j) => {
          const marker = that._markers[j];
          marker.setLatLng(_latlng);
        });
      }
    }
    forEachLatLng(this._rect.getLatLngs());

    const oldLatLngs = copyLatLngs(this._scaledLayer);
    // scale the origin layer
    this._scaledLayer.setLatLngs(
      this._scaleLayer(
        this._ratio,
        this._scaledLayer.pm._scaleOrgLatLng,
        this._scaleOriginLatLng,
        L.PM.Matrix.init(),
        this._map
      )
    );

    this._fireScale(this._scaledLayer, this._ratio, oldLatLngs);
    this._fireScale(this._map, this._ratio, oldLatLngs);
    this._scaledLayer.pm._fireChange(
      this._scaledLayer.getLatLngs(),
      'Scaling'
    );
  },
  _onScaleEnd() {
    const initialDistance = this._initialDistance;
    const origin = this._scaleOriginLatLng;
    const ratio = this._ratio
    delete this._scaleOriginLatLng;
    delete this._scaleOriginPoint;
    delete this._scaleStartPoint;
    delete this._initialDistance;
    delete this._ratio

    const originLatLngs = copyLatLngs(
      this._scaledLayer,
      this._scaledLayer.pm._scaleOrgLatLng
    );
    // store the new latlngs
    this._scaledLayer.pm._scaleOrgLatLng = copyLatLngs(this._scaledLayer);

    this._fireScaleEnd(this._scaledLayer, initialDistance, originLatLngs, undefined, {
      transformation: {
        origin: [origin.lng, origin.lat],
        scale: ratio
      }
    });
    this._fireScaleEnd(this._map, initialDistance, originLatLngs, undefined, {
      transformation: {
        origin: [origin.lng, origin.lat],
        scale: ratio
      }
    });
    this._scaledLayer.pm._fireEdit(this._scaledLayer, 'Scaling');

    this._preventRenderingMarkers(false);

    this._layerScaled = true;
  },
  _scaleLayer(ratio, latlngs, origin, _matrix, map) {
    const originPoint = _toPoint(map, origin);
    this._matrix = _matrix.clone().scale(ratio, originPoint).flip();
    return _convertLatLngs(latlngs, this._matrix, map);
  },
  _getScaleCenter() {
    const polygon = L.polygon(this._layer.getLatLngs(), {
      stroke: false,
      fill: false,
      pmIgnore: true,
    }).addTo(this._layer._map);
    const center = polygon.getCenter();
    polygon.removeFrom(this._layer._map);
    return center;
  },

  /*
   *
   * Public functions f.ex. to disable and enable scaling on the layer directly
   *
   */
  enableScale() {
    if (!this.options.allowScaling) {
      this.disableScale();
      return;
    }

    // We create an hidden polygon. We set pmIgnore to false, so that the `pm` property will be always create, also if OptIn == true
    const options = {
      fill: false,
      stroke: false,
      pmIgnore: false,
      snapIgnore: true,
    };

    // we create a temp polygon for scaling
    this._scaledPoly = L.polygon(this._layer.getLatLngs(), options).addTo(
      this._layer._map
    );
    this._scaledPoly.pm.setOptions(this._layer._map.pm.getGlobalOptions());
    this._scaledPoly.pm.setOptions({
      scale: true,
      snappable: false,
      hideMiddleMarkers: true,
    });
    // we connect the temp polygon (that will be enabled for scaling) with the current layer, so that we can scale the current layer too
    this._scaledPoly.pm._scaledLayer = this._layer;
    this._scaledPoly.pm.enable({
      boundingBox: true
    });

    // store the original latlngs
    this._scaleOrgLatLng = copyLatLngs(this._layer);

    this._scaleEnabled = true;

    this._layer.on('remove', this.disableScale, this);

    this._fireScaleEnable(this._layer);
    // we need to use this._layer._map because this._map can be undefined if layer was never enabled for editing before
    this._fireScaleEnable(this._layer._map);
  },
  disableScale() {
    if (this.scaleEnabled()) {
      if (this._scaledPoly.pm._layerScaled) {
        this._fireUpdate();
      }
      this._scaledPoly.pm._layerScaled = false;
      // delete the temp polygon
      this._scaledPoly.pm.disable();
      this._scaledPoly.remove();
      this._scaledPoly.pm.setOptions({ scaling: false });
      this._scaledPoly = undefined;
      this._scaleOrgLatLng = undefined;

      this._layer.off('remove', this.disableScale, this);

      this._scaleEnabled = false;

      this._fireScaleDisable(this._layer);
      // we need to use this._layer._map because this._map can be undefined if layer was never enabled for editing before
      this._fireScaleDisable(this._layer._map);
    }
  },
  scaleEnabled() {
    return this._scaleEnabled;
  },
  scaleLayer(ratio) {
    this._layer.setLatLngs(
      this._scaleLayer(
        ratio,
        this._layer.getLatLngs(),
        this._getScaleCenter(),
        L.PM.Matrix.init(),
        this._layer._map
      )
    );
    // store the new latlngs
    this._scaleOrgLatLng = L.polygon(this._layer.getLatLngs()).getLatLngs();
    if (
      this.scaleEnabled() &&
      this._scaledPoly &&
      this._scaledPoly.pm.enabled()
    ) {
      this._scaledPoly.setLatLngs(
        this._scaleLayer(
          ratio,
          this._scaledPoly.getLatLngs(),
          this._getScaleCenter(),
          L.PM.Matrix.init(),
          this._scaledPoly._map
        )
      );
      this._scaledPoly.pm._initMarkers();
    }

    this._fireScale(this._layer, ratio, this._layer);
    this._fireScale(this._map, ratio, this._layer);
    this._fireChange(this._layer.getLatLngs(), 'Scaling');
  },
};

export default ScaleMixin;
