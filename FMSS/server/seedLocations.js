/**
 * seedLocations.js
 * Run: node seedLocations.js
 * Seeds all US states + DC + territories with comprehensive city/zip data.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const LocationMaster = require("./models/LocationMaster");

const connectDB = require("./config/db");

// ── Complete US Location Dataset ─────────────────────────────────────────────
// Format: { abbr, name, cities: [[cityName, zip], ...] }
const US_LOCATIONS = [
  { abbr:"AL", name:"Alabama", cities:[["Anniston","36201"],["Auburn","36830"],["Birmingham","35201"],["Decatur","35601"],["Dothan","36301"],["Florence","35630"],["Gadsden","35901"],["Hoover","35216"],["Huntsville","35801"],["Madison","35758"],["Mobile","36601"],["Montgomery","36101"],["Opelika","36801"],["Phenix City","36867"],["Prattville","36066"],["Tuscaloosa","35401"]] },
  { abbr:"AK", name:"Alaska", cities:[["Anchorage","99501"],["Badger","99705"],["College","99701"],["Fairbanks","99701"],["Juneau","99801"],["Ketchikan","99901"],["Kodiak","99615"],["Sitka","99835"],["Wasilla","99654"]] },
  { abbr:"AZ", name:"Arizona", cities:[["Avondale","85323"],["Buckeye","85326"],["Bullhead City","86429"],["Casa Grande","85122"],["Chandler","85224"],["Flagstaff","86001"],["Gilbert","85233"],["Glendale","85301"],["Goodyear","85338"],["Lake Havasu City","86403"],["Maricopa","85138"],["Mesa","85201"],["Peoria","85345"],["Phoenix","85001"],["Prescott","86301"],["Scottsdale","85251"],["Sierra Vista","85635"],["Surprise","85374"],["Tempe","85281"],["Tucson","85701"],["Yuma","85364"]] },
  { abbr:"AR", name:"Arkansas", cities:[["Bentonville","72712"],["Conway","72032"],["Fayetteville","72701"],["Fort Smith","72901"],["Hot Springs","71901"],["Jonesboro","72401"],["Little Rock","72201"],["North Little Rock","72114"],["Pine Bluff","71601"],["Rogers","72756"],["Russellville","72801"],["Springdale","72762"],["Texarkana","71854"]] },
  { abbr:"CA", name:"California", cities:[["Alameda","94501"],["Anaheim","92801"],["Antioch","94509"],["Bakersfield","93301"],["Berkeley","94701"],["Burbank","91501"],["Chico","95926"],["Chula Vista","91910"],["Compton","90220"],["Corona","92879"],["Costa Mesa","92626"],["Daly City","94014"],["Davis","95616"],["El Monte","91731"],["Elk Grove","95624"],["Escondido","92025"],["Fontana","92335"],["Fremont","94536"],["Fresno","93701"],["Fullerton","92831"],["Garden Grove","92840"],["Glendale","91201"],["Hayward","94541"],["Huntington Beach","92646"],["Inglewood","90301"],["Irvine","92602"],["Lancaster","93534"],["Long Beach","90802"],["Los Angeles","90001"],["Modesto","95351"],["Moreno Valley","92551"],["Murrieta","92562"],["Oakland","94601"],["Oceanside","92054"],["Ontario","91761"],["Orange","92856"],["Oxnard","93030"],["Palmdale","93550"],["Pasadena","91101"],["Pomona","91766"],["Rancho Cucamonga","91730"],["Riverside","92501"],["Roseville","95661"],["Sacramento","95814"],["Salinas","93901"],["San Bernardino","92401"],["San Diego","92101"],["San Francisco","94102"],["San Jose","95101"],["Santa Ana","92701"],["Santa Clarita","91350"],["Santa Rosa","95401"],["Simi Valley","93065"],["Spokane","99201"],["Stockton","95201"],["Sunnyvale","94086"],["Torrance","90501"],["Vallejo","94590"],["Victorville","92392"],["Visalia","93277"],["West Covina","91790"]] },
  { abbr:"CO", name:"Colorado", cities:[["Arvada","80001"],["Aurora","80010"],["Boulder","80301"],["Brighton","80601"],["Broomfield","80021"],["Castle Rock","80104"],["Colorado Springs","80901"],["Commerce City","80022"],["Denver","80201"],["Englewood","80110"],["Fort Collins","80521"],["Grand Junction","81501"],["Greeley","80631"],["Highland Ranch","80126"],["Lakewood","80214"],["Longmont","80501"],["Loveland","80537"],["Parker","80134"],["Pueblo","81001"],["Thornton","80229"],["Westminster","80030"]] },
  { abbr:"CT", name:"Connecticut", cities:[["Bridgeport","06601"],["Bristol","06010"],["Danbury","06810"],["East Hartford","06108"],["Greenwich","06830"],["Hartford","06101"],["Manchester","06040"],["Meriden","06450"],["Middletown","06457"],["Milford","06460"],["New Britain","06050"],["New Haven","06501"],["Norwalk","06850"],["Norwich","06360"],["Stamford","06901"],["Waterbury","06701"],["West Hartford","06107"]] },
  { abbr:"DE", name:"Delaware", cities:[["Dover","19901"],["Middletown","19709"],["Newark","19711"],["Smyrna","19977"],["Wilmington","19801"]] },
  { abbr:"DC", name:"District of Columbia", cities:[["Washington","20001"],["Capitol Hill","20003"],["Georgetown","20007"],["Northeast Washington","20002"],["Northwest Washington","20009"],["Southeast Washington","20020"]] },
  { abbr:"FL", name:"Florida", cities:[["Boca Raton","33431"],["Boynton Beach","33435"],["Bradenton","34201"],["Cape Coral","33990"],["Clearwater","33755"],["Coral Springs","33071"],["Daytona Beach","32114"],["Deerfield Beach","33441"],["Deltona","32725"],["Fort Lauderdale","33301"],["Fort Myers","33901"],["Gainesville","32601"],["Hialeah","33010"],["Hollywood","33019"],["Homestead","33030"],["Jacksonville","32099"],["Kissimmee","34741"],["Lakeland","33801"],["Largo","33770"],["Melbourne","32901"],["Miami","33101"],["Miami Gardens","33056"],["Miramar","33023"],["Orlando","32801"],["Palm Bay","32905"],["Palm Beach Gardens","33410"],["Pembroke Pines","33021"],["Pensacola","32501"],["Pompano Beach","33060"],["Port St. Lucie","34952"],["Riverview","33569"],["Sarasota","34230"],["St. Petersburg","33701"],["Tallahassee","32301"],["Tampa","33601"],["Titusville","32780"],["West Palm Beach","33401"],["Winter Haven","33880"]] },
  { abbr:"GA", name:"Georgia", cities:[["Albany","31701"],["Alpharetta","30004"],["Athens","30601"],["Atlanta","30301"],["Augusta","30901"],["Columbus","31901"],["Dalton","30720"],["Dunwoody","30338"],["Johns Creek","30097"],["Macon","31201"],["Marietta","30060"],["Peachtree City","30269"],["Rome","30161"],["Roswell","30075"],["Sandy Springs","30328"],["Savannah","31401"],["Smyrna","30080"],["South Fulton","30349"],["Valdosta","31601"],["Warner Robins","31088"]] },
  { abbr:"HI", name:"Hawaii", cities:[["East Honolulu","96825"],["Hilo","96720"],["Honolulu","96801"],["Kailua","96734"],["Kaneohe","96744"],["Mililani Town","96789"],["Pearl City","96782"],["Waipahu","96797"]] },
  { abbr:"ID", name:"Idaho", cities:[["Boise","83701"],["Caldwell","83605"],["Coeur d'Alene","83814"],["Idaho Falls","83401"],["Lewiston","83501"],["Meridian","83642"],["Nampa","83651"],["Pocatello","83201"],["Rexburg","83440"],["Twin Falls","83301"]] },
  { abbr:"IL", name:"Illinois", cities:[["Aurora","60505"],["Berwyn","60402"],["Bloomington","61701"],["Bolingbrook","60440"],["Champaign","61820"],["Chicago","60601"],["Cicero","60804"],["Decatur","62521"],["Elgin","60120"],["Evanston","60201"],["Joliet","60431"],["Naperville","60540"],["Normal","61761"],["Peoria","61601"],["Rockford","61101"],["Round Lake Beach","60073"],["Schaumburg","60173"],["Springfield","62701"],["Tinley Park","60477"],["Waukegan","60085"]] },
  { abbr:"IN", name:"Indiana", cities:[["Anderson","46011"],["Bloomington","47401"],["Carmel","46032"],["Columbus","47201"],["Evansville","47701"],["Fishers","46037"],["Fort Wayne","46801"],["Gary","46401"],["Hammond","46320"],["Indianapolis","46201"],["Kokomo","46901"],["Lafayette","47901"],["Lawrence","46226"],["Muncie","47302"],["Noblesville","46060"],["South Bend","46601"],["Terre Haute","47801"]] },
  { abbr:"IA", name:"Iowa", cities:[["Ames","50010"],["Ankeny","50021"],["Cedar Falls","50613"],["Cedar Rapids","52401"],["Council Bluffs","51501"],["Davenport","52801"],["Des Moines","50301"],["Dubuque","52001"],["Iowa City","52240"],["Marion","52302"],["Sioux City","51101"],["Waterloo","50701"],["West Des Moines","50265"]] },
  { abbr:"KS", name:"Kansas", cities:[["Kansas City","66101"],["Lawrence","66044"],["Lenexa","66215"],["Manhattan","66502"],["Olathe","66061"],["Overland Park","66204"],["Salina","67401"],["Shawnee","66203"],["Topeka","66601"],["Wichita","67201"]] },
  { abbr:"KY", name:"Kentucky", cities:[["Bowling Green","42101"],["Covington","41011"],["Florence","41022"],["Georgetown","40324"],["Hopkinsville","42240"],["Lexington","40502"],["Louisville","40201"],["Nicholasville","40356"],["Owensboro","42301"],["Paducah","42001"],["Richmond","40475"]] },
  { abbr:"LA", name:"Louisiana", cities:[["Baton Rouge","70801"],["Bossier City","71111"],["Kenner","70062"],["Lafayette","70501"],["Lake Charles","70601"],["Metairie","70001"],["Monroe","71201"],["New Orleans","70112"],["Prairieville","70769"],["Shreveport","71101"]] },
  { abbr:"ME", name:"Maine", cities:[["Auburn","04210"],["Augusta","04330"],["Bangor","04401"],["Biddeford","04005"],["Lewiston","04240"],["Portland","04101"],["South Portland","04106"]] },
  { abbr:"MD", name:"Maryland", cities:[["Annapolis","21401"],["Baltimore","21201"],["Bowie","20715"],["Columbia","21044"],["Ellicott City","21041"],["Frederick","21701"],["Gaithersburg","20877"],["Germantown","20874"],["Glen Burnie","21061"],["Rockville","20850"],["Silver Spring","20901"],["Waldorf","20601"]] },
  { abbr:"MA", name:"Massachusetts", cities:[["Barnstable","02630"],["Boston","02101"],["Brockton","02301"],["Cambridge","02139"],["Fall River","02720"],["Framingham","01701"],["Haverhill","01830"],["Lowell","01851"],["Lynn","01901"],["New Bedford","02740"],["Newton","02458"],["Quincy","02169"],["Somerville","02143"],["Springfield","01101"],["Waltham","02451"],["Worcester","01601"]] },
  { abbr:"MI", name:"Michigan", cities:[["Ann Arbor","48103"],["Clinton Township","48035"],["Dearborn","48120"],["Detroit","48201"],["Farmington Hills","48331"],["Flint","48501"],["Grand Rapids","49501"],["Kalamazoo","49001"],["Lansing","48901"],["Livonia","48150"],["Macomb","48044"],["Pontiac","48340"],["Rochester Hills","48307"],["Roseville","48066"],["Shelby","48315"],["Sterling Heights","48310"],["Troy","48007"],["Warren","48088"],["Westland","48185"],["Wyoming","49509"]] },
  { abbr:"MN", name:"Minnesota", cities:[["Apple Valley","55124"],["Bloomington","55420"],["Brooklyn Park","55443"],["Burnsville","55337"],["Coon Rapids","55433"],["Duluth","55801"],["Eagan","55121"],["Eden Prairie","55344"],["Maple Grove","55311"],["Minneapolis","55401"],["Minnetonka","55343"],["Plymouth","55441"],["Rochester","55901"],["Saint Cloud","56301"],["Saint Paul","55101"],["Woodbury","55125"]] },
  { abbr:"MS", name:"Mississippi", cities:[["Biloxi","39530"],["Brandon","39042"],["Gulfport","39501"],["Hattiesburg","39401"],["Jackson","39201"],["Meridian","39301"],["Olive Branch","38654"],["Southaven","38671"],["Tupelo","38801"]] },
  { abbr:"MO", name:"Missouri", cities:[["Blue Springs","64014"],["Columbia","65201"],["Independence","64050"],["Jefferson City","65101"],["Joplin","64801"],["Kansas City","64101"],["Lee's Summit","64063"],["O'Fallon","63366"],["Springfield","65801"],["St. Charles","63301"],["St. Joseph","64501"],["St. Louis","63101"]] },
  { abbr:"MT", name:"Montana", cities:[["Billings","59101"],["Bozeman","59715"],["Butte","59701"],["Great Falls","59401"],["Helena","59601"],["Kalispell","59901"],["Missoula","59801"]] },
  { abbr:"NE", name:"Nebraska", cities:[["Bellevue","68005"],["Columbus","68601"],["Fremont","68025"],["Grand Island","68801"],["Hastings","68901"],["Kearney","68847"],["Lincoln","68501"],["Norfolk","68701"],["Omaha","68101"]] },
  { abbr:"NV", name:"Nevada", cities:[["Carson City","89701"],["Enterprise","89128"],["Fernley","89408"],["Henderson","89002"],["Las Vegas","89101"],["North Las Vegas","89030"],["Pahrump","89048"],["Reno","89501"],["Sparks","89431"],["Spring Valley","89117"],["Sunrise Manor","89110"],["Whitney","89122"]] },
  { abbr:"NH", name:"New Hampshire", cities:[["Concord","03301"],["Derry","03038"],["Dover","03820"],["Manchester","03101"],["Nashua","03060"],["Rochester","03867"],["Salem","03079"]] },
  { abbr:"NJ", name:"New Jersey", cities:[["Bayonne","07002"],["Camden","08101"],["Clifton","07011"],["East Orange","07017"],["Edison","08817"],["Elizabeth","07201"],["Hamilton","06609"],["Hoboken","07030"],["Jersey City","07302"],["Lakewood","08701"],["Newark","07101"],["Passaic","07055"],["Paterson","07501"],["Toms River","08753"],["Trenton","08601"],["Union City","07087"],["Vineland","08360"],["Woodbridge","07095"]] },
  { abbr:"NM", name:"New Mexico", cities:[["Albuquerque","87101"],["Carlsbad","88220"],["Clovis","88101"],["Farmington","87401"],["Las Cruces","88001"],["Rio Rancho","87124"],["Roswell","88201"],["Santa Fe","87501"],["Sunland Park","88063"]] },
  { abbr:"NY", name:"New York", cities:[["Albany","12201"],["Binghamton","13901"],["Bronx","10451"],["Brooklyn","11201"],["Buffalo","14201"],["Freeport","11520"],["Hempstead","11550"],["Manhattan","10001"],["Mount Vernon","10550"],["New Rochelle","10801"],["New York City","10001"],["Newburgh","12550"],["Niagara Falls","14301"],["Queens","11101"],["Rochester","14601"],["Schenectady","12301"],["Staten Island","10301"],["Syracuse","13201"],["Troy","12180"],["Utica","13501"],["White Plains","10601"],["Yonkers","10701"]] },
  { abbr:"NC", name:"North Carolina", cities:[["Asheville","28801"],["Burlington","27215"],["Cary","27511"],["Chapel Hill","27514"],["Charlotte","28201"],["Concord","28025"],["Durham","27701"],["Fayetteville","28301"],["Gastonia","28052"],["Greensboro","27401"],["High Point","27260"],["Jacksonville","28540"],["Raleigh","27601"],["Rocky Mount","27801"],["Wilmington","28401"],["Winston-Salem","27101"]] },
  { abbr:"ND", name:"North Dakota", cities:[["Bismarck","58501"],["Fargo","58102"],["Grand Forks","58201"],["Minot","58701"],["West Fargo","58078"]] },
  { abbr:"OH", name:"Ohio", cities:[["Akron","44301"],["Canton","44701"],["Cincinnati","45201"],["Cleveland","44101"],["Columbus","43201"],["Dayton","45401"],["Elyria","44035"],["Hamilton","45011"],["Kettering","45429"],["Lakewood","44107"],["Lorain","44052"],["Parma","44129"],["Springfield","45501"],["Toledo","43601"],["Youngstown","44501"]] },
  { abbr:"OK", name:"Oklahoma", cities:[["Broken Arrow","74011"],["Edmond","73003"],["Enid","73701"],["Lawton","73501"],["Midwest City","73110"],["Moore","73160"],["Muskogee","74401"],["Norman","73069"],["Oklahoma City","73101"],["Owasso","74055"],["Stillwater","74074"],["Tulsa","74101"]] },
  { abbr:"OR", name:"Oregon", cities:[["Beaverton","97005"],["Bend","97701"],["Corvallis","97330"],["Eugene","97401"],["Gresham","97030"],["Hillsboro","97123"],["Medford","97501"],["Portland","97201"],["Salem","97301"],["Springfield","97477"],["Tigard","97223"]] },
  { abbr:"PA", name:"Pennsylvania", cities:[["Allentown","18101"],["Altoona","16601"],["Bethlehem","18015"],["Erie","16501"],["Harrisburg","17101"],["Lancaster","17601"],["Philadelphia","19101"],["Pittsburgh","15201"],["Reading","19601"],["Scranton","18501"],["York","17401"]] },
  { abbr:"RI", name:"Rhode Island", cities:[["Cranston","02910"],["East Providence","02914"],["Pawtucket","02860"],["Providence","02901"],["Warwick","02886"],["Woonsocket","02895"]] },
  { abbr:"SC", name:"South Carolina", cities:[["Charleston","29401"],["Columbia","29201"],["Florence","29501"],["Goose Creek","29445"],["Greenville","29601"],["Mount Pleasant","29464"],["North Charleston","29405"],["Rock Hill","29730"],["Spartanburg","29301"],["Summerville","29483"]] },
  { abbr:"SD", name:"South Dakota", cities:[["Aberdeen","57401"],["Brookings","57006"],["Rapid City","57701"],["Sioux Falls","57101"],["Watertown","57201"]] },
  { abbr:"TN", name:"Tennessee", cities:[["Bartlett","38133"],["Brentwood","37027"],["Chattanooga","37401"],["Clarksville","37040"],["Cleveland","37311"],["Franklin","37064"],["Hendersonville","37075"],["Jackson","38301"],["Johnson City","37601"],["Kingsport","37660"],["Knoxville","37901"],["Memphis","38101"],["Murfreesboro","37129"],["Nashville","37201"],["Smyrna","37167"]] },
  { abbr:"TX", name:"Texas", cities:[["Abilene","79601"],["Allen","75002"],["Amarillo","79101"],["Arlington","76001"],["Austin","78701"],["Beaumont","77701"],["Brownsville","78520"],["Carrollton","75006"],["College Station","77840"],["Corpus Christi","78401"],["Dallas","75201"],["Denton","76201"],["El Paso","79901"],["Fort Worth","76101"],["Frisco","75034"],["Garland","75040"],["Grand Prairie","75050"],["Houston","77001"],["Irving","75061"],["Killeen","76541"],["Laredo","78040"],["League City","77573"],["Lewisville","75029"],["Lubbock","79401"],["McAllen","78501"],["McKinney","75069"],["Mesquite","75149"],["Midland","79701"],["Missouri City","77459"],["Odessa","79761"],["Pasadena","77501"],["Pearland","77581"],["Plano","75023"],["Richardson","75080"],["Round Rock","78664"],["San Antonio","78201"],["Sugar Land","77478"],["Tyler","75701"],["Waco","76701"],["Wichita Falls","76301"]] },
  { abbr:"UT", name:"Utah", cities:[["Layton","84040"],["Logan","84321"],["Murray","84107"],["Ogden","84401"],["Orem","84057"],["Provo","84601"],["Salt Lake City","84101"],["Sandy","84070"],["South Jordan","84095"],["St. George","84770"],["Taylorsville","84129"],["West Jordan","84084"],["West Valley City","84119"]] },
  { abbr:"VT", name:"Vermont", cities:[["Barre","05641"],["Burlington","05401"],["Essex","05452"],["Montpelier","05601"],["Rutland","05701"],["South Burlington","05403"]] },
  { abbr:"VA", name:"Virginia", cities:[["Alexandria","22301"],["Chesapeake","23320"],["Hampton","23661"],["Harrisonburg","22801"],["Lynchburg","24501"],["Manassas","20110"],["Newport News","23601"],["Norfolk","23501"],["Portsmouth","23701"],["Richmond","23218"],["Roanoke","24001"],["Suffolk","23434"],["Virginia Beach","23451"]] },
  { abbr:"WA", name:"Washington", cities:[["Bellevue","98004"],["Bellingham","98225"],["Everett","98201"],["Federal Way","98003"],["Kennewick","99336"],["Kent","98031"],["Kirkland","98033"],["Marysville","98270"],["Renton","98055"],["Richland","99352"],["Seattle","98101"],["Shoreline","98133"],["Spokane","99201"],["Spokane Valley","99206"],["Tacoma","98401"],["Vancouver","98660"],["Yakima","98901"]] },
  { abbr:"WV", name:"West Virginia", cities:[["Charleston","25301"],["Clarksburg","26301"],["Huntington","25701"],["Morgantown","26501"],["Parkersburg","26101"],["Weirton","26062"],["Wheeling","26003"]] },
  { abbr:"WI", name:"Wisconsin", cities:[["Appleton","54911"],["Eau Claire","54701"],["Green Bay","54301"],["Janesville","53545"],["Kenosha","53140"],["La Crosse","54601"],["Madison","53701"],["Milwaukee","53201"],["Oshkosh","54901"],["Racine","53401"],["Sheboygan","53081"],["Waukesha","53186"],["Wauwatosa","53213"]] },
  { abbr:"WY", name:"Wyoming", cities:[["Casper","82601"],["Cheyenne","82001"],["Gillette","82716"],["Laramie","82070"],["Rock Springs","82901"]] },
  // ── US Territories ──────────────────────────────────────────────────────────
  { abbr:"AS", name:"American Samoa", cities:[["Pago Pago","96799"],["Tafuna","96799"],["Leone","96799"]] },
  { abbr:"GU", name:"Guam", cities:[["Dededo","96929"],["Tamuning","96913"],["Yigo","96929"],["Barrigada","96913"],["Mangilao","96913"]] },
  { abbr:"MP", name:"Northern Mariana Islands", cities:[["Saipan","96950"],["San Jose","96950"],["Tinian","96952"],["Rota","96951"]] },
  { abbr:"PR", name:"Puerto Rico", cities:[["Bayamón","00960"],["Carolina","00983"],["Caguas","00725"],["Guaynabo","00966"],["Mayagüez","00680"],["Ponce","00716"],["San Juan","00901"],["Trujillo Alto","00976"]] },
  { abbr:"VI", name:"U.S. Virgin Islands", cities:[["Charlotte Amalie","00801"],["Christiansted","00820"],["Frederiksted","00840"],["Kingshill","00850"]] },
];

async function seed() {
  try {
    await connectDB();
    console.log("Connected to MongoDB");

    // Clear existing data
    await LocationMaster.deleteMany({});
    console.log("Cleared existing LocationMaster data");

    const docs = [];
    for (const state of US_LOCATIONS) {
      for (const [city, zip] of state.cities) {
        docs.push({
          stateAbbr: state.abbr,
          stateName: state.name,
          city,
          zip,
        });
      }
    }

    await LocationMaster.insertMany(docs, { ordered: false });
    console.log(`✅ Seeded ${docs.length} location records across ${US_LOCATIONS.length} states/territories`);
    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  }
}

seed();
