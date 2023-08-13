var sensraw = ee.ImageCollection("COPERNICUS/S2_SR");
var boundary = ee.FeatureCollection("users/olawaleasifat/extended_boundary_new");


// File: portfolio/sentinel 2 preprocessing.js
// Version: v1.0
// Date: 2022-05-10
// Authors: Asifat Haruna Olawale
//email: olawaleasifat@gmail.com

//Copyright © 2022 Asifat Haruna. All rights reserved. 
//This work and its accompanying resources, including but not limited to code, documentation, and any associated materials, are protected by copyright laws and international treaties.
// Unauthorized use, reproduction, distribution, or modification of this work, in whole or in part, is strictly prohibited without prior written permission from the copyright holder. 
//Any unauthorized use may result in legal action and be subject to applicable penalties and damages. For inquiries or permissions, please contact Asifat Haruna at olawaleasifat@gmail.com
            
                  //****************************
                        // PREPROCESSING
                //****************************
           
  // Preprocessing is crucial in ensuring  accurate and relaible results in
  //    various applications involving optical satellite imagery.
  
//_____________________________________________________________________________________________
  //The analysis was conducted using data from Hunsrück-Hochwald National Park in Germany. 
  //The boundary of the park is represented by a shape file named "boundary." 
  //If you wish to use the same boundary, you can access it through the following URL link:  
  //https://code.earthengine.google.com/?asset=users/olawaleasifat/extended_boundary_new
  // After importing it into your code editor, remember to rename it as "boundary."
  //If you have a different area of interest, you have the option to replace the input boundary shape file 
  //or use the drawing tools provided on GEE to delineate your desired area.
//_____________________________________________________________________________________________________
//Clouds, shadows, and other artifacts in satellite images can distort or obscure important information.
//To ensure accurate analysis and interpretation of optical satellite products, 
//it is necessary to screen and mask out contaminated pixels. 
//_______________________________________________________________________________________________________

// Function to mask out cloud and shadow using the associated mask and SCL bands
function maskCloudAndShadowsSR(image) {
    var qa = image.select('QA60');
  // Bits 10 and 11 are clouds and cirrus, respectively.
    var cloudBitMask = 1 << 10;
    var cirrusBitMask = 1 << 11;
  // Both flags should be set to zero, indicating clear conditions.
    var mask_qa = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
    var cloudProb = image.select('MSK_CLDPRB');
 // var snowProb = image.select('MSK_SNWPRB');
    var cloud = cloudProb.lt(10);
    var scl = image.select('SCL'); 
    var shadow = scl.eq(3); // 3 = cloud shadow
    var cirrus = scl.eq(10); // 10 = cirrus
    var clp=scl.eq(7) // cloud low probability
    var cmp=scl.eq(8) // cloud medium probability
    var chp=scl.eq(9) // cloud high probabilty
    var snw=scl.eq(11) // snow or ice 
   //cloud probability less than 10% or cloud shadow classification
    var mask_scl=cirrus.neq(1).and(shadow.neq(1)).and(clp.neq(1)).and(cmp.neq(1)).and(chp.neq(1)).and(snw.neq(1));
    var mask_all = mask_qa.and(mask_scl);
    return image.updateMask(mask_all).divide(10000).select("B.*")
  .copyProperties(image,['system:time_start','system:time_end']);
}

//_______________________________________________________________________________________________________

//The dataset used for analysis can be customized based on your research interest by modifying the bounds and dates of interest. 
var dataset = sensraw.filterBounds(boundary)
                  .filterDate('2020-10-06','2023-04-14')
                  // Pre-filter to get less cloudy granules.
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',15)) 
                  .filter(ee.Filter.eq("SENSING_ORBIT_NUMBER",108))
                  .map(maskCloudAndShadowsSR);// apply the mask function above
              
// print dataset to the console    
print("dataset", dataset)

//_______________________________________________________________________________________________________
//setting visualization parameters
var visualization = {
  min: 0.0,
  max: 0.3,
  bands: ['B4', 'B3', 'B2'],
};

//  This centers the map canavas to the geometry of interest  
var forest_mask=boundary.geometry();
Map.centerObject(forest_mask);

// use the first scence of the time steps as the base map 
//Map.addLayer(dataset.first(), visualization, 'RGB');
// use the median of the time steps as the base map 
Map.addLayer(dataset.median(), visualization, 'RGB');
Map.addLayer(forest_mask,{color:"red"},"forest_boundary",0);


//_______________________________________________________________________________________________________
// This function extracts dates from the conventional dataset name
function extract_date(d){
    var tmp =ee.String(d).split("_").get(0);
    var tmp_date=ee.String(tmp).slice(0,8);
    return ee.Date.parse('YYYYMMdd',tmp_date).format("YYYY-MM-dd");
    }
//_______________________________________________________________________________________________________

var property_index= dataset.aggregate_array("system:index").aside(print)

//extract unique time step of the time series 
var date_index= property_index.map(extract_date).aside(print)

var unique_non_null_date= date_index.distinct().aside(print)

//_______________________________________________________________________________________________________
//Mosaic of overlaping or repeated scences. start(inclusive) and end(exclusive) date pair
var observed_nonnull_dates_pairs=unique_non_null_date.slice(0,-1).zip(unique_non_null_date.slice(1)).aside(print)
//_______________________________________________________________________________________________________

var observed_daily_Images= observed_nonnull_dates_pairs.map(function(d) {
    
    var start_date=ee.List(d).get(0)
    var end_date = ee.List(d).get(1)
    var filtered=  dataset.filterDate(start_date, end_date)
    var aggre_t0=filtered.aggregate_array("system:time_start").get(-1)
    var aggre_t1 = filtered.aggregate_array("system:time_end").get(-1)
    var aggre_index= filtered.aggregate_array("system:index").get(-1)
    var _dict =ee.Dictionary({
                          "system:time_start":aggre_t0,"system:time_end":aggre_t1, "system:index":aggre_index
                        })
    
    var observed_daily = filtered.median().set(_dict)  
  return observed_daily
   
   
}).flatten().aside(print)


var observed_daily_Images =ee.ImageCollection(observed_daily_Images).aside(print)
observed_daily_Images.first().get("system:index").aside(print)//print out to consule

//_______________________________________________________________________________________________________

// this step is necessary to extract the date index of each image
// alternative this could be done in python environment by parsing and splitting the image file name
var observed_daily_Images= observed_daily_Images.map(function(image){
  
  var date0=image.get("system:index")
  //.map(extract_date_2)
  var date1=ee.String(date0).split("_").get(0);
  var tmp_date=ee.String(date1).slice(0,8);
  //var date2= ee.Date.parse('YYYYMMdd',tmp_date).format("YYYY-MM-dd");
  var date2= ee.Date.parse('YYYYMMdd',tmp_date).format("YYYYMMdd");
  var data=image.set({"Date":date2})
return data
}).aside(print)
//_______________________________________________________________________________________________________

                //********************************************************
                    //computation of spectral vegetation indices 
                      //from the filtered image bands 
                //********************************************************
                
//_______________________________________________________________________________________________________

// Source :https://gis.stackexchange.com/questions/345972/image-constant-parameter-value-is-required-error-in-google-earth-engine
// reducer stats to use in the stats function
var mean_std_reducers=ee.Reducer.mean().combine({
  reducer2: ee.Reducer.stdDev(),
  sharedInputs: true
  });

// function returns the mean and std of an image band as 
//constant_mean and constant_stdDev respectively
// Note it is important to set scale and crs inorder to get a consisitent result
// since the default crs for GEE is wgs 84. Also maxPixels to higher value prevent 
//likely execution errors for larger images.
//boundary
var mean_std_kwargs=({
  reducer: mean_std_reducers,
  geometry :boundary,
  scale:10,
  maxPixels: 1e13,
  crs:'EPSG:25832'
  })
//_______________________________________________________________________________________________________


// computation os spectral vegetation indices from the filtered image bands 

function svi(image) {
  
  //var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
  var ndvi = image.expression("((b(8)-b(4))/(b(8)+b(4)))*10000").rename('NDVI')
  // don't rename yet so that u can extract the mean and std devaiation as band1_mean and band1_stdDev respectively

 //****************************
  //Shi and Xu, 2019 coefficient .
 //****************************
 
  var tcb= image.expression("(0.2569*b(1))+(0.2934*b(2))+(0.3020*b(3))+(0.3099*b(4))+(0.3740*b(5))+(0.4180*b(6))+(0.3580*b(7))+(0.3834*b(8))+(0.0896*b(10))+(0.0780*b(11))")//.rename("TCB")
  var tcg= image.expression("(-0.2818*b(1))+(-0.3020*b(2))+(-0.4283*b(3))+(-0.2959*b(4))+(0.1602*b(5))+(0.3127*b(6))+(0.3138*b(7))+(0.4261*b(8))+(-0.1341*b(10))+(-0.2538*b(11))")//.rename("TCG")
  var tcw= image.expression("((0.1763*b(1))+(0.1615*b(2))+(0.0486*b(3))+(0.0170*b(4))+(0.0223*b(5))+(0.0219*b(6))+(-0.0755*b(7))+(-0.0910*b(8))+(-0.7701*b(10))+(-0.5293*b(11)))")//.rename("TCW")
 //****************************
  //coefficient similar to ERS Nedkov, 2017.
 //****************************
  //var tcg= image.expression("(-0.1128*b(1))+(-0.168*b(2))+(-0.348*b(3))+(-0.3303*b(4))+(0.0852*b(5))+(0.3302*b(6))+(0.3165*b(7))+(0.3625*b(8))+(-0.4578*b(10))+(-0.4064*b(11))")//.rename("TCG")
  //var tcw= image.expression("((0.1363*b(1))+(0.2802*b(2))+(0.3072*b(3))+(0.5288*b(4))+(0.1379*b(5))+(-0.0001*b(6))+(-0.0807*b(7))+(-0.1389*b(8))+(-0.4064*b(10))+(-0.5602*b(11)))*10000")//.rename("TCW")
  //var tcb= image.expression("(0.0822*b(1))+(0.136*b(2))+(0.2611*b(3))+(0.2964*b(4))+(0.3338*b(5))+(0.3877*b(6))+(0.3895*b(7))+(0.475*b(8))+(0.3882*b(10))+(0.1366*b(11))")//.rename("TCB")

// disturbance index
 //****************************
  //Mišurec J, Kopačková V, Lhotáková Z, Campbell P, Albrechtová J. 
  //Detection of Spatio-Temporal Changes of Norway Spruce Forest Stands in Ore Mountains Using Landsat Time Series and Airborne Hyperspectral Imagery.
  // Remote Sensing. 2016; 8(2):92. https://doi.org/10.3390/rs8020092
 //****************************  

//tc greeness with stats
  var tcg_stats=tcg.reduceRegion(mean_std_kwargs)
  var tcg_mean=ee.Image(ee.Number(tcg_stats.get("constant_mean")))
  var tcg_std=ee.Image(ee.Number(tcg_stats.get("constant_stdDev")))
  var tcg_mean_std=tcg.addBands(tcg_mean).addBands(tcg_std)
  
  //tc wetness with stats
  var tcw_stats=tcw.reduceRegion(mean_std_kwargs)
  var tcw_mean=ee.Image(ee.Number(tcw_stats.get("constant_mean")))
  var tcw_std=ee.Image(ee.Number(tcw_stats.get("constant_stdDev")))
  var tcw_mean_std=tcw.addBands(tcw_mean).addBands(tcw_std)
   
  //tc brightness with stats
  var tcb_stats=tcb.reduceRegion(mean_std_kwargs)
  var tcb_mean=ee.Image(ee.Number(tcb_stats.get("constant_mean")))
  var tcb_std=ee.Image(ee.Number(tcb_stats.get("constant_stdDev")))
  var tcb_mean_std=tcb.addBands(tcb_mean).addBands(tcb_std)


  
  var tcgr= tcg_mean_std.expression("(b(0)-b(1))/b(2)")
  var tcwr=tcw_mean_std.expression("(b(0)-b(1))/b(2)")
  var tcbr=tcb_mean_std.expression("(b(0)-b(1))/b(2)")
  var di=tcbr.subtract(tcgr.add(tcwr))

  //scale your value to reduce file size
  //and rename bands before exporting it
 
  tcw=tcw.multiply(10000).rename("TCW")
  tcb=tcb.multiply(10000).rename("TCB")
  tcg=tcg.multiply(10000).rename("TCG")
  di= di.multiply(10000).rename("DI")
  
  var ndre2=image.expression("((b(6)-b(4))/(b(6)+b(4)))*10000").rename("NDRE2")
  var nbr= image.expression("((b(7)-b(11))/(b(7)+b(11)))*10000").rename("NBR")   
  //var tcari=image.expression("3*((b(4)-b(3))-0.2*(b(4)-b(2))*(b(4)/b(3)))/((1 + 0.16)*(b(6)-b(3))/(b(6)+b(3)+0.16))").rename("TCARI")
  var vi= ndvi.addBands(ndre2).addBands(nbr).addBands(tcw).addBands(tcb).addBands(tcg).addBands(di)
  return vi.copyProperties(image,['system:time_start','system:time_end'])
}

//_______________________________________________________________________________________________________

//apply the svi function on image collections
var vi=observed_daily_Images.map(svi).aside(print)

//_______________________________________________________________________________________________________

                //********************************************************
                                  //Visualization
                //********************************************************
//_______________________________________________________________________________________________________

//Map.addLayer(vi.first(),{bands:["NDVI","NDRE2","NBR"]}, 'SVI');

//Map.addLayer(vi.filterDate('2018-08-03','2018-08-06'),{bands:["NDVI","TCW","DI"]}, 'SVI');

//A time series plot is generated for a random point within the study area, 
//which can be replaced with a point of interest chosen by the user.


var roi=ee.Geometry.Point([ 6.926380555555556,49.653980555555556]) 

// Make a chart.
var chart = ui.Chart.image.series({
  imageCollection: ee.ImageCollection(vi).select("NBR"),
  
  region: roi,
  reducer: ee.Reducer.first(), 
  scale: 10
});

// Define custom options for the chart. See:
// https://developers.google.com/chart/interactive/docs/reference
var options = { 
  title: 'NBR over time', 
  hAxis: { title: 'time' },
  vAxis: { title: 'NBR' },
  series: {
    0: { color: 'green' }
  }
};

// Set the options of the chart and print it.
chart = chart.setOptions(options);
print(chart); // Print it in the console


//_______________________________________________________________________________________________________

                //********************************************************
                          //Export prepossed products
                //********************************************************
//_______________________________________________________________________________________________________

//import a function from the tools module and set
// export options and suffix to the outname if necessary otherwise use '' for the suffix

var utilities = require('users/olawaleasifat/portfolio:tools')

var exportOptions = {
  folder: 'EXPORT_FOLDER',
  scale: 10,
  crs: 'EPSG:25832',
  maxPixels: 1e13
  // Add more export options here
};

var suffix = '_ETRS'; // Add your desired suffix here

// The preprocess products can be exported in batch into a google cloud storage(drive)
//where it could be mounted and used for further analysis
//uncomment if you want to export the product
                  //||||||
                  //vvvvvv
//utilities.batchExportToTiff(vi, exportOptions,suffix)
