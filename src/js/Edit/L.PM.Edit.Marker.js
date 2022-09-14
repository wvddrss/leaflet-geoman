import Edit from './L.PM.Edit';
import MarkerLimits from '../Mixins/MarkerLimits';

Edit.Marker = Edit.extend({
  _shape: 'Marker',
  initialize(layer) {
    // layer is a marker in this case :-)
    this._layer = layer;
    this._enabled = false;

    // register dragend event e.g. to fire pm:edit
    this._layer.on('dragend', this._onDragEnd, this);
  },
  includes: [MarkerLimits],
  options: {
    rotate: true,
    // rectangle
    boundsOptions: {
      weight: 1,
      opacity: 1,
      dashArray: [3, 3],
      noClip: true,
    },
  },
  /**
   * Bounding polygon
   * @return {L.Polygon}
   */
  _getBoundingBox () {
    const marginAroundIcon = 8
    const widthIcon = this._layer.options.icon.options.iconSize[0]
    const heightIcon = this._layer.options.icon.options.iconSize[1]
    const {
      lat,
      lng
    } = this._layer.getLatLng()
    const pxsCoordinate = this._map.project([lng, lat])
    const boundingBoxPxs = [
      //southWest
      [
        [pxsCoordinate.x - marginAroundIcon],
        [pxsCoordinate.y + marginAroundIcon]
      ],
      //northEast
      [
        [pxsCoordinate.x + marginAroundIcon],
        [pxsCoordinate.y - marginAroundIcon]
      ],
    ]

    const newLatLngs = []

    boundingBoxPxs.forEach(point => {
      const newPointInLatLng = this._map.unproject(L.point(point))
      newLatLngs.push([newPointInLatLng.lng, newPointInLatLng.lat])
    })

    return new L.Rectangle(
      newLatLngs,
      {
        ...this.options.boundsOptions,
        draggable: true
      }
    );
  },
  // TODO: remove default option in next major Release
  enable(options = { draggable: true }) {
    L.Util.setOptions(this, options);

    // layer is not allowed to edit
    if (!this.options.allowEditing || !this._layer._map) {
      this.disable();
      return;
    }

    this._map = this._layer._map;

    if (this.enabled()) {
      this.disable();
    }
    this.applyOptions();

    // if shape gets removed from map, disable edit mode
    this._layer.on('remove', this.disable, this);

    this._enabled = true;

    this._fireEnable();
  },
  enableRotate() {
    this._map = this._layer._map;
    this._initBoundingBox()
    this._drawBoundingBox()
  },
  disableRotate() {
    this._deleteDrawBoundingBox()
  },
  _deleteDrawBoundingBox() {
    if (this.rotateEnabled()) {
      if (this._rect) {
        this._rect.remove()
        this._rect = undefined
        this._markerGroup = false
      }
      if (this._rotatePoly) {
        this._rotatePoly.pm._layerRotated = false; // delete the temp polygon

        this._rotatePoly.pm.disable();

        this._rotatePoly.remove();

        this._rotatePoly.pm.setOptions({
          rotate: false
        });

        this._rotatePoly = undefined;
        this._rotateOrgLatLng = undefined;

        this._layer.off('remove', this.disableRotate, this);

        this._rotateEnabled = false;

        this._fireRotationDisable(this._layer); // we need to use this._layer._map because this._map can be undefined if layer was never enabled for editing before


        this._fireRotationDisable(this._layer._map);
      }
      if (this._markerGroup) {
        this._markerGroup.remove();
      }
    }
  },
  _initBoundingBox () {
    // cleanup old ones first
    if (this._markerGroup) {
      console.log('clean up old markers')
      this._markerGroup.clearLayers();
    }

    // add markerGroup to map, markerGroup includes regular and middle markers
    console.log('add marker group')
    this._markerGroup = new L.LayerGroup();
    this._markerGroup._pmTempLayer = true;
    this._rotateEnabled = true
    this._rotationLayer = this._layer
  },
  _drawBoundingBox () {
    this._rect = this._rect || this._getBoundingBox().addTo(this._markerGroup);
    this._rect.pm._isBoundingBox = true
    this._rect._map = this._map
    this._rect.pm._markerGroup = this._markerGroup
    this._layer._map.addLayer(this._markerGroup);
    const formattedAngle = this._layer.options.rotationAngle > 360 ? this._layer.options.rotationAngle - 360 : this._layer.options.rotationAngle
    console.log('rotating bounding box', formattedAngle)
    this._rect.pm.rotateLayer(formattedAngle ?? 0);
    this._rect.options['rotationAngle'] =formattedAngle
    this._createHandlers()
  },
  _createHandlers () {
    this._markers = [];
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < 4; i++) {
      // TODO: add stretching
      this._markers.push(
        this._createMarker(this._rect._latlngs[0][i])
      );
    }
  },
  _createMarker (latlng, extraClass) {
    const marker = new L.Marker(latlng, {
      draggable: true,
      icon: L.divIcon({ className: ['marker-icon', extraClass].join('') }),
    });
    this._setPane(marker, 'vertexPane');

    marker._pmTempLayer = true;

    if (this.options.rotate) {
      marker.on('dragstart', this._onRotateStart, this);
      marker.on('drag', this._onRotate, this);
      marker.on('dragend', this._onRotateEnd, this);
    }

    this._markerGroup.addLayer(marker);

    return marker;
  },
  disable() {
    console.log('disable edit marker')
    // if it's not enabled, it doesn't need to be disabled
    if (!this.enabled()) {
      return;
    }

    // disable dragging, as this could have been active even without being enabled
    this.disableLayerDrag();

    // remove listener
    this._layer.off('remove', this.disable, this);
    this._layer.off('contextmenu', this._removeMarker, this);

    if (this._layerEdited) {
      this._fireUpdate();
    }
    this._layerEdited = false;
    this._fireDisable();

    this._enabled = false;
  },
  enabled() {
    return this._enabled;
  },
  toggleEdit(options) {
    if (!this.enabled()) {
      this.enable(options);
    } else {
      this.disable();
    }
  },
  applyOptions() {
    if (this.options.snappable) {
      this._initSnappableMarkers();
    } else {
      this._disableSnapping();
    }

    if (this.options.draggable) {
      this.enableLayerDrag();
    } else {
      this.disableLayerDrag();
    }
    // enable removal for the marker
    if (!this.options.preventMarkerRemoval) {
      this._layer.on('contextmenu', this._removeMarker, this);
    }
  },
  _removeMarker(e) {
    const marker = e.target;
    marker.remove();
    // TODO: find out why this is fired manually, shouldn't it be catched by L.PM.Map 'layerremove'?
    this._fireRemove(marker);
    this._fireRemove(this._map, marker);
  },
  _onDragEnd() {
    this._fireEdit();
    this._layerEdited = true;
  },
  // overwrite initSnappableMarkers from Snapping.js Mixin
  _initSnappableMarkers() {
    const marker = this._layer;

    this.options.snapDistance = this.options.snapDistance || 30;
    this.options.snapSegment =
      this.options.snapSegment === undefined ? true : this.options.snapSegment;

    marker.off('pm:drag', this._handleSnapping, this);
    marker.on('pm:drag', this._handleSnapping, this);

    marker.off('pm:dragend', this._cleanupSnapping, this);
    marker.on('pm:dragend', this._cleanupSnapping, this);

    marker.off('pm:dragstart', this._unsnap, this);
    marker.on('pm:dragstart', this._unsnap, this);
  },
  _disableSnapping() {
    const marker = this._layer;
    marker.off('pm:drag', this._handleSnapping, this);
    marker.off('pm:dragend', this._cleanupSnapping, this);
    marker.off('pm:dragstart', this._unsnap, this);
  },
});
