var _ = require("lodash");

var facebookMetaAttributes = ["og", "fb", "article"];

var flattenObject = function(ob) {
  var toReturn = {};

  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;

    if (typeof ob[i] == 'object' && ob[i] !== null) {
      var flatObject = flattenObject(ob[i]);
      for (var x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;

        toReturn[i + ':' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
};

class Base {
  constructor (config, pageType, pageIdentifier) {
    this.config = config;
    this.pageType = pageType;
    this.pageIdentifier = pageIdentifier;
    this.groupedMetadata = this.config["seo-metadata"];
  }

  getMetaTags(options) {
    var obj = flattenObject(this.toObject());
    var mergedobject = _.merge(obj,options);
    var arrayOfMetaTags = []
    for (var key in obj) {
      if(_.includes(facebookMetaAttributes, _.first(key.split(":")))) {
        arrayOfMetaTags.push(`<meta content= "${obj[key]}" property= "${key}">`);
      } else if (key === "alternate"){
        for (var i = 0; i < obj[key].length; i++) {
          arrayOfMetaTags.push(`<link href="${obj[key][i]["href"]}" rel="alternate" title="${obj[key][i]["title"]}" type="${obj[key][i]["type"]}" />`);
        }
      } else if(key === "canonical") {
        arrayOfMetaTags.push(`<link rel="canonical" href="${obj[key]}" />`)
      } else if (key === "title"){
        arrayOfMetaTags.push(`<title>${obj[key]}</title>`)
      } else {
        arrayOfMetaTags.push(`<meta content= "${obj[key]}" name= "${key}">`);
      }
    }
    return arrayOfMetaTags;
  }

  toObject() {
    return this.tags(this.pageMetadata())
  }

  tags(metadata) {
    throw "Implement this in child class";
  }

  pageMetadata() {
    return _
    .chain(this.groupedMetadata)
    .filter(pageData => pageData["owner-type"] === this.pageType && pageData["owner-id"] === this.pageIdentifier)
    .first()
    .get("data", {})
    .value()
  }
}

class Home extends Base {

  constructor(config) {
    super(config, "home", null)
  }

  tags(metadata) {
    var title = this.getTitle(metadata);
    return _
    .chain(metadata)
    .omit("page-title")
    .merge({
      "title": title,
      "description": metadata["description"],
      "og": {
        "title": metadata["title"],
        "description": metadata["description"]
      },
      "twitter": {
        "title": metadata["title"],
        "description": metadata["description"]
      },
      "msvalidate.01": _.get(this.config, ["integrations", "bing", "app-id"]),
      "fb": {
        "app_id": _.get(this.config, ["facebook", "app-id"])
      },
      "alternate": [{
        "href": "/feed",
        "type": "application/atom+xml",
        "title": `${title} ATOM Feed`
      }]})
    .value()
  }

  getTitle(metadata) {
    return _.has(metadata, "page-title") ? metadata["page-title"] : this.config["title"];
  }
}

class Section extends Base {
  constructor(config, section) {
    super(config, "section", section["id"])
    this.section = section
  }

  tags(metadata) {
    var title = this.getTitle(metadata)

    return _
    .chain(metadata)
    .omit("page-title")
    .merge({
      "title": title,
      "description": metadata["description"],
      "og": {
        "title": metadata["title"],
        "description": metadata["description"]
      },
      "twitter": {
        "title": metadata["title"],
        "description": metadata["description"]
      }})
    .value()
  }

  getTitle(metadata) {
    return _.has(metadata, "page-title") ? metadata["page-title"] : this.makeHyphenatedTitle();
  }

  makeHyphenatedTitle() {
    return (this.section["display-name"] || this.section["name"]) + " - " + (this.config["title"] || "");
  }

}

class SectionCollection extends Base {
  constructor(config, collection) {
    super(config, "section", _.get(collection,["metadata","section",0,"id"]))
    this.collection = collection
  }

  tags(metadata) {
    var title = this.getTitle(metadata)

    return _
    .chain(metadata)
    .omit("page-title")
    .merge({
      "title": title,
      "description": metadata["description"] ? metadata["description"] : '',
      "og": this.ogAttributes(metadata),
      "twitter": this.twitterAttributes(metadata)
    })
    .value()
  }

  twitterAttributes(metadata) {
    return {
      "title": metadata["title"] ? metadata["title"] : this.getTitle(metadata),
      "description": metadata["description"] ? metadata["description"] : '',
      "image": {
        "src": this.coverImageUrl()
      }
    }
  }

  ogAttributes(metadata) {
    var obj = {
        "title": metadata["title"] ? metadata["title"] : this.getTitle(metadata),
        "description": metadata["description"] ? metadata["description"] : '',
        "image": this.coverImageUrl()
      }
      if(_.get(this.collection, ['metadata', 'cover-image', 'cover-image-metadata'])) {
        var coverImageMetadata = _.get(this.collection, ['metadata', 'cover-image', 'cover-image-metadata']);
        _.merge(obj, {"image:width": coverImageMetadata["width"],
          "image:height": coverImageMetadata["height"]})
      }
    return obj;
  }

  coverImageUrl() {
    return _.get(this.collection, ['metadata', 'cover-image']) ? (this.config["cdn-name"] + _.get(this.collection, ['metadata', 'cover-image','cover-image-s3-key'])).replace(/ /g, "%20") : '';
  }

  getTitle(metadata) {
    return _.has(metadata, "page-title") ? metadata["page-title"] : this.makeHyphenatedTitle();
  }

  makeHyphenatedTitle() {
    if (this.config["title"]) {
      return this.collection["name"] + " - " + this.config["title"];
    }
    return this.collection["name"];
  }

}

class Search extends Base {
  constructor(config, term) {
    super(config, "search")
    this.term = term
  }

  tags(metadata) {
    var title = this.getTitle();
    return {
      "title": title
    }
  }

  getTitle() {
    return this.term + " - Search Results";
  }
}

class StaticPage extends Base {
  constructor(config, name,  title) {
    super(config, "static-page", name);
    this.name = name;
    this.title = title;
  }

  tags(metadata) {
    return {
      "title": this.title
    }
  }
}

class Story extends Base {
  constructor(config, story) {
    super(config, story)
    this.story =  story;
    this.url = story["canonical-url"] || _.get(story, ['seo', 'og', 'url']) || `${config['sketches-host']}/${story['slug']}`;
  }

  tags(metadata) {
    var title = this.getTitle(metadata);
    return _.chain(metadata)
    .omit("page-title")
    .merge({
      "title": title,
      "description": this.getDescription(),
      "og": this.ogAttributes(),
      "twitter": this.twitterAttributes(),
      "fb": {
        "app_id": _.get(this.config, ["facebook", "app-id"])
      },
      "article": {
        "publisher": _.get(this.config , ["social-links", "facebook-url"])
      },
      "msvalidate.01": _.get(this.config, ["integrations", "bing", "app-id"]),
      "canonical": this.url,
      "al:android:package": _.get(this.config, ["apps-data", "al:android:package"]),
      "al:android:app_name": _.get(this.config, ["apps-data", "al:android:app-name"]),
      "al:android:url": `quintypefb://${this.config["sketches-host"]}/${this.story["slug"]}`,
      "news_keywords": this.storyKeywords().join(','),
      "keywords": this.storyKeywords().join(','),
      "standout": this.googleStandoutTag()
    })
    .value();
  }

  twitterAttributes() {
    return {
     "title": this.story["headline"],
     "description": this.story["summary"],
     "card": "summary_large_image",
     "site": _.get(this.config, ["social-app-credentials", "twitter", "username"]),
     "image": {
        "src": this.heroImageUrl()
      }
    }
  }

  getDescription() {
    var seoMetaDescription = _.get(this.story, ["seo", "meta-description"]);
    return seoMetaDescription ? _.trim(seoMetaDescription) : _.trim(this.story["summary"]);
  }

  ogAttributes() {
    var obj = {
      "title": this.story["headline"],
      "type": "article",
      "url": this.url,
      "site_name": this.config["title"],
      "description": this.story["summary"],
      "image": (this.config["cdn-name"] + this.story["hero-image-s3-key"]).replace(/ /g, "%20")
    }
    if(_.get(this.story, "hero-image-metadata")) {
      var heroImageMetadata = _.get(this.story, "hero-image-metadata");
      _.merge(obj, {"image:width": heroImageMetadata["width"],
        "image:height": heroImageMetadata["height"]})
    }
    return obj;
  }

  heroImageUrl() {
    return (this.config["cdn-name"] + this.story["hero-image-s3-key"]).replace(/ /g, "%20")
  }

  getTitle(metadata) {
    return _.get(this.story, ['seo', 'meta-title']) || this.makeHyphenatedTitle();
  }

  makeHyphenatedTitle() {
    return this.story["headline"] + " - " + this.config["title"];
  }

  storyKeywords() {
    var metaKeywords = _.chain(this.story)
                        .get(["seo", "meta-keywords"])
                        .compact()
                        .value();
    return _.isEmpty(metaKeywords) ?
      _.map(this.story['tags'], 'name') :
      metaKeywords;
  }

  googleStandoutTag() {
     return _.get(this.story, ['seo', 'meta_google_news_standout']) ? this.config['sketches-host'] + '/' + story['slug'] : '';
  }
}

class CardShare extends Story {
  constructor(config, story, card) {
    super(config, story);
    this.card = card;
  }

  ogAttributes() {
    var url = this.url + '/card/' + this.card.id;
    var storyOgAttributes = super.ogAttributes();
    if (_.isEmpty(this.card))
      return storyOgAttributes;
    var obj = {
      "title": _.get(this.card, ['metadata', 'social-share', 'title']),
      "description": _.get(this.card, ['metadata', 'social-share', 'message']),
      "image": `${this.config['cdn-name']}${_.get(this.card, ['metadata', 'social-share', 'image', 'key'])}`.replace(/ /g, "%20"),
      "image:width": _.get(this.card, ['metadata', 'social-share', 'image', 'metadata', 'width']),
      "image:height": _.get(this.card, ['metadata', 'social-share', 'image', 'metadata', 'height']),
      "url": url
    }

    return _.merge(storyOgAttributes, obj)
  }

  twitterAttributes() {
    var storyTwitterAttributes = super.twitterAttributes();
    if (_.isEmpty(this.card))
      return storyTwitterAttributes;
    var obj = {
      "title": _.get(this.card, ['metadata', 'social-share', 'title']),
      "description": _.get(this.card, ['metadata', 'social-share', 'message']),
      "image": {
        "src": `${this.config['cdn-name']}${_.get(this.card, ['metadata', 'social-share', 'image', 'key'])}`.replace(/ /g, "%20")
      }
    }
    return _.merge(storyTwitterAttributes, obj)
  }
}

class StoryElement extends Base {
  constructor(config, story, storyElement) {
    super(config, "story-element")
    this.story = story;
    this.storyElement = storyElement;
  }

  tags(metadata) {
    var title = this.getTitle(metadata);
    return _
           .chain(metadata)
           .omit("page-title")
           .merge({
            "title": title,
            "canonical": this.story["canonical-url"]
           })
           .value()
  }

  getTitle(metadata) {
    return this.story["headline"] + " - " + this.config["title"];
  }
}

class Tag extends Base {
  constructor(config, tag) {
    super(config, "tag", tag)
    this.tag = tag;
  }

  tags(metadata) {
    var title = this.getTitle(metadata);
    return {"title": title};
  }

  getTitle(metadata) {
    return this.tag + " - " + (this.config["title"] || "");
  }
}


module.exports = {
  HomeSeo: Home,
  SectionSeo: Section,
  SectionCollectionSeo: SectionCollection,
  SearchSeo: Search,
  StaticPageSeo: StaticPage,
  StorySeo: Story,
  StoryElementSeo: StoryElement,
  TagSeo: Tag,
  CardShareSeo: CardShare
}
