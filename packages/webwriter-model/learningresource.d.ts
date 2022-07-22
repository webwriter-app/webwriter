type ArrayOrValue<T> = T | T[]

/** https://schema.org/Thing */ 
interface Thing {
  /**An additional type for the item, typically used for adding more specific types from external vocabularies in microdata syntax. This is a relationship between something and a class that the thing is in. In RDFa syntax, it is better to use the native RDFa syntax - the 'typeof' attribute - for multiple types. Schema.org tools may have only weaker understanding of extra types, in particular those defined externally. */
  additionalType?: ArrayOrValue<string>
  /**An alias for the item. */
  alternateName?: ArrayOrValue<string>
  /**A description of the item. */
  description?: ArrayOrValue<string>
  /**A sub property of description. A short description of the item used to disambiguate from other, similar items. Information from other properties (in particular, name) may be necessary for the description to be useful for disambiguation. */
  disambiguatingDescription?: ArrayOrValue<string>
  /**The identifier property represents any kind of identifier for any kind of Thing, such as ISBNs, GTIN codes, UUIDs etc. Schema.org provides dedicated properties for representing many of these, either as textual strings or as URL (URI) links. See background notes for more details. */
  identifier?: ArrayOrValue<string>
  /**An image of the item. This can be a URL or a fully described ImageObject. */
  image?: ArrayOrValue<string>
  /**Indicates a page (or other CreativeWork) for which this thing is the main entity being described. See background notes for details. Inverse property: mainEntity */
  mainEntityOfPage?: ArrayOrValue<string>
  /**The name of the item. */
  name?: ArrayOrValue<string>
  /**Indicates a potential Action, which describes an idealized action in which this thing would play an 'object' role. */
  potentialAction?: ArrayOrValue<string>
  /**URL of a reference Web page that unambiguously indicates the item's identity. E.g. the URL of the item's Wikipedia page, Wikidata entry, or official website. */
  sameAs?: ArrayOrValue<string>
  /**A CreativeWork or Event about this Thing. Inverse property: about */
  subjectOf?: ArrayOrValue<string>
  /**URL of the item. */
  url?: ArrayOrValue<string>
}

/**https://www.w3.org/2021/a11y-discov-vocab/latest/#accessMode-vocabulary */
type AccessMode = "auditory" | "chartOnVisual" | "chemOnVisual" | "colorDependent" | "diagramOnVisual" | "mathOnVisual" | "musicOnVisual" | "tactile" | "textOnVisual" | "textual" | "visual"

/**https://www.w3.org/2021/a11y-discov-vocab/latest/#accessModeSufficient-vocabulary */
type AccessModeSufficient = "auditory" | "tactile" | "textual" | "visual"

/**https://www.w3.org/2021/a11y-discov-vocab/latest/#accessibilityAPI-vocabulary */
type AccessibilityAPI = "AndroidAccessibility" | "ATK" | "AT-SPI" | "iAccessible2" | "JavaAccessibility" | "MSAA" | "NSAccessibility" | "UIAccessibility" | "UIAutomation"

/**https://www.w3.org/2021/a11y-discov-vocab/latest/#accessibilityControl-vocabulary */
type AccessibilityControl = "fullKeyboardControl" | "fullMouseControl" | "fullSwitchControl" | "fullTouchControl" | "fullVideoControl" | "fullVoiceControl"

/**https://www.w3.org/2021/a11y-discov-vocab/latest/#accessibilityFeature-vocabulary */
type AccessibilityFeature = "annotations" | "ARIA" | "index" | "printPageNumbers" | "readingOrder" | "structuralNavigation" | "tableOfContents" | "taggedPDF" | "alternativeText" | "audioDescription" | "captions" | "describedMath" | "longDescription" | "rubyAnnotations" | "signLanguage" | "transcript" | "displayTransformability" | "synchronizedAudioText" | "timingControl" | "unlocked" | "ChemML" | "latex" | "MathML" | "ttsMarkup" | "highContrastAudio" | "highContrastDisplay" | "largePrint" | "braille" | "tactileGraphic" | "tactileObject"

type AccessibilityHazard = "flashing" | "noFlashingHazard" | "motionSimulation" | "noMotionSimulationHazard" | "sound" | "noSoundHazard"

type URLString = string

/**https://schema.org/CreativeWork */
interface CreativeWork extends Thing {
  /**The subject matter of the content. Inverse property: subjectOf */
  about?: ArrayOrValue<string | URLString>
  /**An abstract is a short description that summarizes a CreativeWork.  */
  abstract?: ArrayOrValue<string>
  /**The human sensory perceptual system or cognitive faculty through which a person may process or perceive information. Values should be drawn from the approved vocabulary. */
  accessMode?: ArrayOrValue<AccessMode>
  /**A list of single or combined accessModes that are sufficient to understand all the intellectual content of a resource. Values should be drawn from the approved vocabulary. */
  accessModeSufficient?: ArrayOrValue<AccessModeSufficient>
  /**Indicates that the resource is compatible with the referenced accessibility API. Values should be drawn from the approved vocabulary. */
  accessibilityAPI?: ArrayOrValue<AccessibilityAPI>
  /**Identifies input methods that are sufficient to fully control the described resource. Values should be drawn from the approved vocabulary. */
  accessibilityControl?: ArrayOrValue<AccessibilityControl>
  /**Content features of the resource, such as accessible media, alternatives and supported enhancements for accessibility. Values should be drawn from the approved vocabulary. */
  accessibilityFeature?: ArrayOrValue<AccessibilityFeature> | "none"
  /**A characteristic of the described resource that is physiologically dangerous to some users. Related to WCAG 2.0 guideline 2.3. Values should be drawn from the approved vocabulary. */
  accessibilityHazard?: ArrayOrValue<AccessibilityHazard> | "unknown" | "none"
  /**A human-readable summary of specific accessibility features or deficiencies, consistent with the other accessibility metadata but expressing subtleties such as "short descriptions are present but long descriptions will be needed for non-visual users" or "short descriptions are present and no long descriptions are needed." */
  accessibilitySummary?: ArrayOrValue<string>
  /**Specifies the Person that is legally accountable for the CreativeWork. */
  accountablePerson?: ArrayOrValue<string>
  /**Indicates a page documenting how licenses can be purchased or otherwise acquired, for the current item. */
  acquireLicensePage?: ArrayOrValue<string>
  /**The overall rating, based on a collection of reviews or ratings, of the item. */
  aggregateRating?: ArrayOrValue<string>
  /**A secondary title of the CreativeWork. */
  alternativeHeadline?: ArrayOrValue<string>
  /**Indicates a page or other link involved in archival of a CreativeWork. In the case of MediaReview, the items in a MediaReviewItem may often become inaccessible, but be archived by archival, journalistic, activist, or law enforcement organizations. In such cases, the referenced page may not directly publish the content. */
  archivedAt?: ArrayOrValue<string>
  /**A media object that encodes this CreativeWork. This property is a synonym for encoding. */
  associatedMedia?: ArrayOrValue<string>
  /**An intended audience, i.e. a group for whom something was created. Supersedes serviceAudience. */
  audience?: ArrayOrValue<string>
  /**An embedded audio object. */
  audio?: ArrayOrValue<string>
  /**The author of this content or rating. Please note that author is special in that HTML 5 provides a special mechanism for indicating authorship via the rel tag. That is equivalent to this and may be used interchangeably. */
  author?: ArrayOrValue<string>
  /**An award won by or for this item. Supersedes awards. */
  award?: ArrayOrValue<string>
  /**Fictional person connected with a creative work. */
  character?: ArrayOrValue<string>
  /**A citation or reference to another creative work, such as another publication, web page, scholarly article, etc. */
  citation?: ArrayOrValue<string>
  /**Comments, typically from users. */
  comment?: ArrayOrValue<string>
  /**The number of comments this CreativeWork (e.g. Article, Question or Answer) has received. This is most applicable to works published in Web sites with commenting system; additional comments may exist elsewhere. */
  commentCount?: ArrayOrValue<string>
  /**Conditions that affect the availability of, or method(s) of access to, an item. Typically used for real world items such as an ArchiveComponent held by an ArchiveOrganization. This property is not suitable for use as a general Web access control mechanism. It is expressed only in natural language. For example "Available by appointment from the Reading Room" or "Accessible only from logged-in accounts".*/
  conditionsOfAccess?: ArrayOrValue<string>
  /**The location depicted or described in the content. For example, the location in a photograph or painting. */
  contentLocation?: ArrayOrValue<string>
  /**Official rating of a piece of content—for example,'MPAA PG-13'. */
  contentRating?: ArrayOrValue<string>
  /**The specific time described by a creative work, for works (e.g. articles, video objects etc.) that emphasise a particular moment within an Event. */
  contentReferenceTime?: ArrayOrValue<string>
  /**A secondary contributor to the CreativeWork or Event. */
  contributor?: ArrayOrValue<string>
  /**The party holding the legal copyright to the CreativeWork. */
  copyrightHolder?: ArrayOrValue<string>
  /**Text of a notice appropriate for describing the copyright aspects of this Creative Work, ideally indicating the owner of the copyright for the Work. */
  copyrightNotice?: ArrayOrValue<string>
  /**The year during which the claimed copyright for the CreativeWork was first asserted. */
  copyrightYear?: ArrayOrValue<number>
  /**Indicates a correction to a CreativeWork, either via a CorrectionComment, textually or in another document. */
  correction?: ArrayOrValue<string>
  /**The country of origin of something, including products as well as creative works such as movie and TV content. In the case of TV and movie, this would be the country of the principle offices of the production company or individual responsible for the movie. For other kinds of CreativeWork it is difficult to provide fully general guidance, and properties such as contentLocation and locationCreated may be more applicable. In the case of products, the country of origin of the product. The exact interpretation of this may vary by context and product type, and cannot be fully enumerated here. */
  countryOfOrigin?: ArrayOrValue<string>
  /**The status of a creative work in terms of its stage in a lifecycle. Example terms include Incomplete, Draft, Published, Obsolete. Some organizations define a set of terms for the stages of their publication lifecycle. */
  creativeWorkStatus?: ArrayOrValue<string>
  /**The creator/author of this CreativeWork. This is the same as the Author property for CreativeWork. */
  creator?: ArrayOrValue<string>
  /**Text that can be used to credit person(s) and/or organization(s) associated with a published Creative Work. */
  creditText?: ArrayOrValue<string>
  /**The date on which the CreativeWork was created or the item was added to a DataFeed. */
  dateCreated?: ArrayOrValue<Date>
  /**The date on which the CreativeWork was most recently modified or when the item's entry was modified within a DataFeed. */
  dateModified?: ArrayOrValue<Date>
  /**Date of first broadcast/publication. */
  datePublished?: ArrayOrValue<Date>
  /**A link to the page containing the comments of the CreativeWork. */
  discussionUrl?: ArrayOrValue<string>
  /**An EIDR (Entertainment Identifier Registry) identifier representing a specific edit / edition for a work of film or television. For example, the motion picture known as "Ghostbusters" whose titleEIDR is "10.5240/7EC7-228A-510A-053E-CBB8-J", has several edits e.g. "10.5240/1F2A-E1C5-680A-14C6-E76B-I" and "10.5240/8A35-3BEE-6497-5D12-9E4F-3". Since schema.org types like Movie and TVEpisode can be used for both works and their multiple expressions, it is possible to use titleEIDR alone (for a general description), or alongside editEIDR for a more edit-specific description. */
  editEIDR?: ArrayOrValue<string>
  /**Specifies the Person who edited the CreativeWork. */
  editor?: ArrayOrValue<string>
  /**Media type typically expressed using a MIME format (see IANA site and MDN reference) e.g. application/zip for a SoftwareApplication binary, audio/mpeg for .mp3 etc.). In cases where a CreativeWork has several media type representations, encoding can be used to indicate each MediaObject alongside particular encodingFormat information. Unregistered or niche encoding and file formats can be indicated instead via the most appropriate URL, e.g. defining Web page or a Wikipedia/Wikidata entry. Supersedes fileFormat. */
  encodingFormat?: ArrayOrValue<string>
  /**A creative work that this work is an example/instance/realization/derivation of. Inverse property: workExample */
  exampleOfWork?: ArrayOrValue<string>
  /**Date the content expires and is no longer useful or available. For example a VideoObject or NewsArticle whose availability or relevance is time-limited, or a ClaimReview fact check whose publisher wants to indicate that it may no longer be relevant (or helpful to highlight) after some date. */
  expires?: ArrayOrValue<Date>
  /**A person or organization that supports (sponsors) something through some kind of financial contribution. */
  funder?: ArrayOrValue<string>
  /**A Grant that directly or indirectly provide funding or sponsorship for this item. See also ownershipFundingInfo. Inverse property: fundedItem */
  funding?: ArrayOrValue<string>
  /**Genre of the creative work, broadcast channel or group. */
  genre?: ArrayOrValue<string>
  /**Indicates an item or CreativeWork that is part of this item, or CreativeWork (in some sense). Inverse property: isPartOf */
  hasPart?: ArrayOrValue<string>
  /**Headline of the article. */
  headline?: ArrayOrValue<string>
  /**The language of the content or performance or used in an action. Please use one of the language codes from the IETF BCP 47 standard. See also availableLanguage. Supersedes language. */
  inLanguage?: ArrayOrValue<string>
  /**The number of interactions for the CreativeWork using the WebSite or SoftwareApplication. The most specific child type of InteractionCounter should be used. Supersedes interactionCount. */
  interactionStatistic?: ArrayOrValue<number>
  /**The predominant mode of learning supported by the learning resource. Acceptable values are 'active', 'expositive', or 'mixed'. */
  interactivityType?: ArrayOrValue<string>
  /**Used to indicate a specific claim contained, implied, translated or refined from the content of a MediaObject or other CreativeWork. The interpreting party can be indicated using claimInterpreter. */
  interpretedAsClaim?: ArrayOrValue<string>
  /**A flag to signal that the item, event, or place is accessible for free. Supersedes free. */
  isAccessibleForFree?: ArrayOrValue<string>
  /**A resource from which this work is derived or from which it is a modification or adaption. Supersedes isBasedOnUrl. */
  isBasedOn?: ArrayOrValue<string>
  /**Indicates whether this content is family friendly. */
  isFamilyFriendly?: ArrayOrValue<string>
  /**Indicates an item or CreativeWork that this item, or CreativeWork (in some sense), is part of. Inverse property: hasPart */
  isPartOf?: ArrayOrValue<string>
  /**Keywords or tags used to describe some item. Multiple textual entries in a keywords list are typically delimited by commas, or by repeating the property. */
  keywords?: ArrayOrValue<string>
  /**A license document that applies to this content, typically indicated by URL. */
  license?: ArrayOrValue<string>
  /**The location where the CreativeWork was created, which may not be the same as the location depicted in the CreativeWork. */
  locationCreated?: ArrayOrValue<string>
  /**Indicates the primary entity described in some page or other CreativeWork. Inverse property: mainEntityOfPage */
  mainEntity?: ArrayOrValue<string>
  /**A maintainer of a Dataset, software package (SoftwareApplication), or other Project. A maintainer is a Person or Organization that manages contributions to, and/or publication of, some (typically complex) artifact. It is common for distributions of software and data to be based on "upstream" sources. When maintainer is applied to a specific version of something e.g. a particular version or packaging of a Dataset, it is always possible that the upstream source has a different maintainer. The isBasedOn property can be used to indicate such relationships between datasets to make the different maintenance roles clear. Similarly in the case of software, a package may have dedicated maintainers working on integration into software distributions such as Ubuntu, as well as upstream maintainers of the underlying work. */
  maintainer?: ArrayOrValue<string>
  /**A material that something is made from, e.g. leather, wool, cotton, paper. */
  material?: ArrayOrValue<string>
  /**The quantity of the materials being described or an expression of the physical space they occupy. */
  materialExtent?: ArrayOrValue<string>
  /**Indicates that the CreativeWork contains a reference to, but is not necessarily about a concept. */
  mentions?: ArrayOrValue<string>
  /**An offer to provide this item—for example, an offer to sell a product, rent the DVD of a movie, perform a service, or give away tickets to an event. Use businessFunction to indicate the kind of transaction offered, i.e. sell, lease, etc. This property can also be used to describe a Demand. While this property is listed as expected on a number of common types, it can be used in others. In that case, using a second type, such as Product or a subtype of Product, can clarify the nature of the offer. Inverse property: itemOffered */
  offers?: ArrayOrValue<string>
  /**A pattern that something has, for example 'polka dot', 'striped', 'Canadian flag'. Values are typically expressed as text, although links to controlled value schemes are also supported. */
  pattern?: ArrayOrValue<string>
  /**The position of an item in a series or sequence of items. */
  position?: ArrayOrValue<string>
  /**The person or organization who produced the work (e.g. music album, movie, tv/radio series etc.). */
  producer?: ArrayOrValue<string>
  /**The service provider, service operator, or service performer; the goods producer. Another party (a seller) may offer those services or goods on behalf of the provider. A provider may also serve as the seller. Supersedes carrier. */
  provider?: ArrayOrValue<string>
  /**A publication event associated with the item. */
  publication?: ArrayOrValue<string>
  /**The publisher of the creative work. */
  publisher?: ArrayOrValue<string>
  /**The publishing division which published the comic. */
  publisherImprint?: ArrayOrValue<string>
  /**The publishingPrinciples property indicates (typically via URL) a document describing the editorial principles of an Organization (or individual e.g. a Person writing a blog) that relate to their activities as a publisher, e.g. ethics or diversity policies. When applied to a CreativeWork (e.g. NewsArticle) the principles are those of the party primarily responsible for the creation of the CreativeWork. While such policies are most typically expressed in natural language, sometimes related information (e.g. indicating a funder) can be expressed using schema.org terminology. */
  publishingPrinciples?: ArrayOrValue<string>
  /**The Event where the CreativeWork was recorded. The CreativeWork may capture all or part of the event. Inverse property: recordedIn */
  recordedAt?: ArrayOrValue<string>
  /**The place and time the release was issued, expressed as a PublicationEvent. */
  releasedEvent?: ArrayOrValue<string>
  /**A review of the item. Supersedes reviews. */
  review?: ArrayOrValue<string>
  /**Indicates (by URL or string) a particular version of a schema used in some CreativeWork. This property was created primarily to indicate the use of a specific schema.org release, e.g. 10.0 as a simple string, or more explicitly via URL, https://schema.org/docs/releases.html#v10.0. There may be situations in which other schemas might usefully be referenced this way, e.g. http://dublincore.org/specifications/dublin-core/dces/1999-07-02/ but this has not been carefully explored in the community. */
  schemaVersion?: ArrayOrValue<string>
  /**Indicates the date on which the current structured data was generated / published. Typically used alongside sdPublisher */
  sdDatePublished?: ArrayOrValue<Date>
  /**A license document that applies to this structured data, typically indicated by URL. */
  sdLicense?: ArrayOrValue<string>
  /**Indicates the party responsible for generating and publishing the current structured data markup, typically in cases where the structured data is derived automatically from existing published content but published on a different site. For example, student projects and open data initiatives often re-publish existing content with more explicitly structured metadata. The sdPublisher property helps make such practices more explicit. */
  sdPublisher?: ArrayOrValue<string>
  /**A standardized size of a product or creative work, specified either through a simple textual string (for example 'XL', '32Wx34L'), a QuantitativeValue with a unitCode, or a comprehensive and structured SizeSpecification; in other cases, the width, height, depth and weight properties may be more applicable. */
  size?: ArrayOrValue<number>
  /**The Organization on whose behalf the creator was working. */
  sourceOrganization?: ArrayOrValue<string>
  /**The "spatial" property can be used in cases when more specific properties (e.g. locationCreated, spatialCoverage, contentLocation) are not known to be appropriate. */
  spatial?: ArrayOrValue<string>
  /**The spatialCoverage of a CreativeWork indicates the place(s) which are the focus of the content. It is a subproperty of contentLocation intended primarily for more technical and detailed materials. For example with a Dataset, it indicates areas that the dataset describes: a dataset of New York weather would have spatialCoverage which was the place: the state of New York. */
  spatialCoverage?: ArrayOrValue<string>
  /**A person or organization that supports a thing through a pledge, promise, or financial contribution. e.g. a sponsor of a Medical Study or a corporate sponsor of an event. */
  sponsor?: ArrayOrValue<string>
  /**The "temporal" property can be used in cases where more specific properties (e.g. temporalCoverage, dateCreated, dateModified, datePublished) are not known to be appropriate. */
  temporal?: Date | ArrayOrValue<string>
  /**The temporalCoverage of a CreativeWork indicates the period that the content applies to, i.e. that it describes, either as a DateTime or as a textual string indicating a time period in ISO 8601 time interval format. In the case of a Dataset it will typically indicate the relevant time period in a precise notation (e.g. for a 2011 census dataset, the year 2011 would be written "2011/2012"). Other forms of content e.g. ScholarlyArticle, Book, TVSeries or TVEpisode may indicate their temporalCoverage in broader terms - textually or via well-known URL. Written works such as books may sometimes have precise temporal coverage too, e.g. a work set in 1939 - 1945 can be indicated in ISO 8601 interval format format via "1939/1945". Open-ended date ranges can be written with ".." in place of the end date. For example, "2015-11/.." indicates a range beginning in November 2015 and with no specified final date. This is tentative and might be updated in future when ISO 8601 is officially updated. Supersedes datasetTimeInterval. */
  temporalCoverage?: ArrayOrValue<string>
  /**The textual content of this CreativeWork. */
  text?: ArrayOrValue<string>
  /**A thumbnail image relevant to the Thing. */
  thumbnailUrl?: ArrayOrValue<string>
  /**Approximate or typical time it takes to work with or through this learning resource for the typical intended target audience, e.g. 'PT30M', 'PT1H25M'. */
  timeRequired?: ArrayOrValue<string>
  /**The work that this work has been translated from. e.g. 物种起源 is a translationOf “On the Origin of Species”. Inverse property: workTranslation */
  translationOfWork?: ArrayOrValue<string>
  /**Organization or person who adapts a creative work to different languages, regional differences and technical requirements of a target market, or that translates during some event. */
  translator?: ArrayOrValue<string>
  /*Organization or person who adapts a creative work to different languages, regional differences and technical requirements of a target market, or that translates during some event.* */
  typicalAgeRange?: ArrayOrValue<string>
  /**The schema.org usageInfo property indicates further information about a CreativeWork. This property is applicable both to works that are freely available and to those that require payment or other transactions. It can reference additional information e.g. community expectations on preferred linking and citation conventions, as well as purchasing details. For something that can be commercially licensed, usageInfo can provide detailed, resource-specific information about licensing options. This property can be used alongside the license property which indicates license(s) applicable to some piece of content. The usageInfo property can provide information about other licensing options, e.g. acquiring commercial usage rights for an image that is also available under non-commercial creative commons licenses. */
  usageInfo?: ArrayOrValue<string>
  /**The version of the CreativeWork embodied by a specified resource. */
  version?: ArrayOrValue<string> | ArrayOrValue<number>
  /**An embedded video object. */
  video?: ArrayOrValue<string>
  /**Example/instance/realization/derivation of the concept of this creative work. eg. The paperback edition, first edition, or eBook. Inverse property: exampleOfWork */
  workExample?: ArrayOrValue<string>
  /** A work that is a translation of the content of this work. e.g. 西遊記 has an English workTranslation “Journey to the West”, a German workTranslation “Monkeys Pilgerfahrt” and a Vietnamese translation Tây du ký bình khảo. Inverse property: translationOfWork */
  workTranslation?: ArrayOrValue<string>
}

/**https://schema.org/LearningResource */
export interface LearningResource extends CreativeWork {
  /**The item being described is intended to assess the competency or learning outcome defined by the referenced term. */
  assesses?: ArrayOrValue<string>
  /**Knowledge, skill, ability or personal attribute that must be demonstrated by a person or other entity in order to do something such as earn an Educational Occupational Credential or understand a LearningResource.  */
  competencyRequired?: ArrayOrValue<string>
  /**An alignment to an established educational framework. This property should not be used where the nature of the alignment can be described using a simple property, for example to express that a resource teaches or assesses a competency. */
  educationalAlignment?: ArrayOrValue<string>
  /**The level in terms of progression through an educational or training context. Examples of educational levels include 'beginner', 'intermediate' or 'advanced', and formal sets of level indicators. */
  educationalLevel?: ArrayOrValue<string>
  /**The purpose of a work in the context of education; for example, 'assignment', 'group work'. */
  educationalUse?: ArrayOrValue<string>
  /**The predominant type or kind characterizing the learning resource. For example, 'presentation', 'handout'. */
  learningResourceType?: ArrayOrValue<string>
  /**The item being described is intended to help a person learn the competency or learning outcome defined by the referenced term. */
  teaches?: ArrayOrValue<string>
}