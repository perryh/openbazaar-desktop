import $ from 'jquery';
import 'selectize';
import loadTemplate from '../../../utils/loadTemplate';
import regions, { getTranslatedRegions, getIndexedRegions } from '../../../data/regions';
import { getTranslatedCountries, getCountryByDataName } from '../../../data/countries';
import ServiceMd from '../../../models/listing/Service';
import app from '../../../app';
import Service from './Service';
import BaseView from '../../baseVw';

export default class extends BaseView {
  constructor(options = {}) {
    if (!options.model) {
      throw new Error('Please provide a model.');
    }

    if (typeof options.getCurrency !== 'function') {
      throw new Error('Please provide a function for me to obtain the current currency.');
    }

    const opts = {
      listPosition: 1,
      ...options,
    };

    super(opts);
    this.options = opts;

    // get regions
    this.countryRegionData = getTranslatedRegions(app.settings.get('language'))
      .map(regionObj => ({
        id: regionObj.id,
        text: regionObj.name,
        // we want regions to appear at the top of the list
        sortByText: `AAA_${regionObj.name}`,
        isRegion: true,
      }));

    // now, we'll add in the countries
    const countryData = getTranslatedCountries(app.settings.get('language'))
      .map(countryObj => ({
        id: countryObj.dataName,
        text: countryObj.name,
        sortByText: countryObj.name,
        isRegion: false,
      }));
    this.countryRegionData = this.countryRegionData.concat(countryData);

    this.services = this.model.get('services');
    this.serviceViews = [];

    this.listenTo(this.services, 'add', (serviceMd) => {
      const serviceVw = this.createServiceView({
        model: serviceMd,
      });

      this.serviceViews.push(serviceVw);
      this.$servicesWrap.append(serviceVw.render().el);
    });

    this.listenTo(this.services, 'remove', (serviceMd, servicesCl, removeOpts) => {
      const [splicedVw] = this.serviceViews.splice(removeOpts.index, 1);
      splicedVw.remove();
    });
  }

  events() {
    const events = {
      'click .js-removeShippingOption': 'onClickRemoveShippingOption',
      'click .js-btnAddService': 'onClickAddService',
      'click .js-moo': 'onClickMoo',
      'click .js-clearShipDest': 'onClickClearShipDest',
    };

    events[`change #shipOptionType_${this.model.cid}`] = 'onChangeShippingType';

    return events;
  }

  tagName() {
    return 'section';
  }

  onClickMoo() {
    const selectize = this.$shipDestinationSelect[0]
      .selectize;
    const region = getIndexedRegions().ALL;

    if (region) {
      const selectValues = selectize.getValue();

      // we won't add in the region element, instead
      // the countries that comprise the region
      // console.log(`the index of the region is ${selectValues.indexOf(value)}`);
      // selectValues.splice(selectValues.indexOf(value), 1);

      selectize.setValue(
          selectValues.concat(region.countries),
          true
        );

      // selectize.refreshOptions();
      // selectize.refreshItems();
    }
  }

  onClickClearShipDest() {
    this.$shipDestinationSelect[0]
      .selectize
      .clear();
  }

  onClickRemoveShippingOption() {
    this.trigger('click-remove', { view: this });
  }

  onClickAddService() {
    this.services
      .push(new ServiceMd());
  }

  onChangeShippingType(e) {
    let method;

    if ($(e.target).val() === 'LOCAL_PICKUP') {
      method = 'addClass';
    } else {
      method = 'removeClass';

      const services = this.model.get('services');

      if (!services.length) services.push(new ServiceMd());
    }

    this.$serviceSection[method]('hide');
  }

  set listPosition(position) {
    if (typeof position !== 'number') {
      throw new Error('Please provide a position as a number');
    }

    const prevPosition = this.options.listPosition;
    const listPosition = this.options.listPosition = position;

    if (listPosition !== prevPosition) {
      this.$headline.text(
        app.polyglot.t('editListing.shippingOptions.optionHeading', { listPosition })
      );
    }
  }

  get listPosition() {
    return this.options.listPosition;
  }

  // Sets the model based on the current data in the UI.
  setModelData() {
    // set the data for our nested Services views
    this.serviceViews.forEach((serviceVw) => serviceVw.setModelData());
    this.model.set(this.getFormData(this.$formFields));
  }

  createServiceView(opts) {
    const options = {
      getCurrency: this.options.getCurrency,
      ...opts || {},
    };

    const view = this.createChild(Service, options);

    this.listenTo(view, 'click-remove', e => {
      this.services.remove(
        this.services.at(this.serviceViews.indexOf(e.view)));
    });

    return view;
  }

  get $headline() {
    return this._$headline ||
      (this._$headline = this.$('h1'));
  }

  get $shipDestinationDropdown() {
    return this._$shipDestinationDropdown ||
      (this._$shipDestinationDropdown =
        this.$(`#shipDestinationsDropdown_${this.model.cid}`));
  }

  get $serviceSection() {
    return this._$serviceSection ||
      (this._$serviceSection = this.$('.js-serviceSection'));
  }

  get $formFields() {
    return this._$formFields ||
      (this._$formFields =
        this.$('select[name], input[name], textarea[name]').filter((index, el) => (
          !$(el).parents('.js-serviceSection').length)));
  }

  containsRegion(region, list = this.$shipDestinationSelect[0].selectize.getValue()) {
    const indexedRegion = getIndexedRegions()[region];

    if (!indexedRegion) {
      throw new Error('The provided region is not one of' +
        ' available regions.');
    }

    return indexedRegion.countries
      .every(elem => list.indexOf(elem) > -1);
  }

  get fullRegions() {
    // Returns a list of any regions that are fully represented
    // in the country dropdown (i.e. all the individual countries
    // of the region are selected - the actual region selection may
    // or may not be)
    const selectedRegions = [];

    regions.forEach(region => {
      if (this.containsRegion(region.id)) {
        selectedRegions.push(region.id);
      }
    });

    return selectedRegions;
  }

  render() {
    loadTemplate('modals/editListing/shippingOption.html', t => {
      this.$el.html(t({
        // Since multiple instances of this view will be rendered, any id's should
        // include the cid, so they're unique.
        cid: this.model.cid,
        listPosition: this.options.listPosition,
        shippingTypes: this.model.shippingTypes,
        errors: this.model.validationError || {},
        ...this.model.toJSON(),
        regions: this.model.get('regions').map(region => {
          const countryData = getCountryByDataName(region);

          return {
            text: countryData.name,
            value: region,
          };
        }),
      }));

      this.$(`#shipOptionType_${this.model.cid}`).select2({
        // disables the search box
        minimumResultsForSearch: Infinity,
      });

      this.$shipDestinationSelect = this.$(`#shipDestinationsSelect_${this.model.cid}`);
      this.$shipDestinationsPlaceholder = this.$(`#shipDestinationsPlaceholder_${this.model.cid}`);
      this.$servicesWrap = this.$('.js-servicesWrap');

      this.$shipDestinationSelect.selectize({
        delimiter: ',',
        options: this.countryRegionData,
        items: this.model.get('regions'),
        valueField: 'id',
        labelField: 'text',
        // searchField: 'text',
        // sortField: 'sortByText',
        render: {
          // item: item => `<div class="item">${item.text}</div>`,
          // option: item => {
          //   let text = item.text;

          //   if (item.isRegion) {
          //     if (this.containsRegion(item.id)) {
          //       text = app.polyglot.t(`regions.clear_${item.id}`);
          //     } else {
          //       text = app.polyglot.t(`regions.${item.id}`);
          //     }
          //   }

          //   return `<div class="option ${item.isRegion ? 'region' : ''}" >` +
          //     `${text}</div>`;
          // },
          // option: item => {
          //   return `<div class="option ${item.isRegion ? 'region' : ''}" >` +
          //     `${item.text}</div>`;
          //   },
        },
        selectOnTab: true,
        hideSelected: false,
        // closeAfterSelect: true,
        onItem34Add: (value) => {
          if (this.addingCountryRegionItems) return;

          console.log('moo');

          // manage regions
          const region = getIndexedRegions()[value];
          const selectize = this.$shipDestinationSelect[0]
            .selectize;

          if (region) {
            const selectValues = selectize.getValue();
            this.addingCountryRegionItems = true;

            // we won't add in the region element, instead
            // the countries that comprise the region
            console.log(`the index of the region is ${selectValues.indexOf(value)}`);
            selectValues.splice(selectValues.indexOf(value), 1);

            selectize.setValue(
                selectValues.concat(region.countries),
                true
              );

            // selectize.refreshOptions();
            // selectize.refreshItems();

            this.addingCountryRegionItems = false;
          }
        },
      }).on('changeHERO', e => {
        console.log('times are a changing');
        const curSelected = $(e.target).val();
        const newSelected = this.fullRegions;
        const indexedRegions = getIndexedRegions();

        curSelected.forEach(selected => {
          // We started the newSelected list with any fully
          // represented regions, not we'll add in the selected
          // countries.
          if (!indexedRegions[selected]) {
            newSelected.push(selected);
          }
        });

        $(e.target).val(newSelected);
      });

      this.serviceViews.forEach((serviceVw) => serviceVw.remove());
      this.serviceViews = [];
      const servicesFrag = document.createDocumentFragment();

      this.model.get('services').forEach((serviceMd) => {
        const serviceVw = this.createServiceView({ model: serviceMd });

        this.serviceViews.push(serviceVw);
        serviceVw.render().$el.appendTo(servicesFrag);
      });

      this.$servicesWrap.append(servicesFrag);

      this._$headline = null;
      this._$shipDestinationDropdown = null;
      this._$formFields = null;
      this._$serviceSection = null;
    });

    return this;
  }
}
