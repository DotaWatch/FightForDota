var g_version = 1;
var g_bTooltipCSSLoaded = false;
var g_rgRequestedFeeds = [];

// store our tooltip data and whether or not we have it
var g_rgItemData;
var g_bItemDataReady = false;
var g_rgAbilityData;
var g_bAbilityDataReady = false;
var g_rgHeroData;
var g_bHeroDataReady = false;

// turn tooltips off ex. when dragging icons
var g_bTooltipsActive = true;

// class to look for to attach item tooltips
var g_itemIconClass = 'itemIconWithTooltip';
// class to look for to attach ability tooltips
var g_abilityIconClass = 'abilityIconWithTooltip';
// class to look for to attach hero tooltips
var g_heroIconClass = 'heroIconWithTooltip';

// search all image elements, adding tooltips when img src matches our scheme
var g_bSearchIMGTags = false;
var g_rgItemIcons = [];
var g_rgAbilityIcons = [];
var g_rgHeroIcons = [];
// base URL used if above search option is true
var g_IMGBaseURL = 'http://cdn.dota2.com/apps/dota2/images/';
// wrap item, ability, and hero images with links to heropedia (if not already linked elsewhere)
// for abilities, choose whether to link to ability video (default) or associated hero
// for heroes, also allow showing full tooltip or just hero name
var g_bWrapItems = false;
var g_bWrapAbilities = false;
var g_bWrapHeroes = false;
var g_linkAbilitiesTo = 'video';
var g_bHeroTTNameOnly = false;
var g_dotaBaseURL = 'http://www.dota2.com/';
var g_tooltipHoverDelay = 0;
var g_tooltipDelayCount = 0;
				
// This callback is fired when the tooltip is created. It will take the return text and inject it into the tooltip html
var g_tooltipInsertCallback = null;

$(document).ready(
	function() 
	{
		if ( typeof g_skipInitialTooltipSetup == 'undefined' || !g_skipInitialTooltipSetup )
			setupTooltips();
	}
);

function setupTooltips( selectorPrepend )
{
	// optional jquery css selector to limit scope of items to add tooltips to
	if ( !selectorPrepend )
	{
		selectorPrepend = '';
	}
	var rgNeededFeeds = [];
	$.each( [ 'item', 'ability', 'hero' ], 
		function( i, ttType )
		{
			icons = GetIconCollection( ttType, selectorPrepend );

			rgNeededFeeds.push( ttType+'data' );

			$( 'body' ).delegate(
				icons.selector,
				'mouseenter',
				// Mouse over
				function( e )
				{
					if ( g_bTooltipsActive )
					{
						g_tooltipDelayCount = setTimeout( ShowTooltip, getTooltipHoverDelay(), ttType, $(this), true );
					}
				}
			).delegate(
				icons.selector,
				'mouseleave',
				// Mouse out
				function( e )
				{
					ShowTooltip( ttType, $(this), false );
					clearTimeout( g_tooltipDelayCount );
				}
			);
		}
	);
	if ( rgNeededFeeds.length )
	{
		LoadTooltipCSS(); 
		LoadHeropediaData( rgNeededFeeds );
	}
}



function getTooltipHoverDelay()
{
	return g_tooltipHoverDelay;
}
				
function setTooltipHoverDelay( delay )
{
	g_tooltipHoverDelay = delay;
}

function addTooltipInsertionCallback( callback )
{
	if ( typeof callback === "function" )
	{
		g_tooltipInsertCallback = callback;
	}
}

function WrapIconsWithLinks( ttType, selectorPrepend )
{
	if ( !selectorPrepend )
	{
		selectorPrepend = '';
	}

	icons = GetIconCollection( ttType, selectorPrepend );
	
	icons.each(
		function( i )
		{
			if ( $(this).parent('a').length )
				return;
			
			if ( ttType == 'ability' )
			{
				abilityName = $(this).attr( 'abilityname' );
				linkURL = g_dotaBaseURL + 'hero/' + g_rgAbilityData[abilityName].hurl + '/';
				if ( g_linkAbilitiesTo == 'video' )
				{
					linkURL += 'abilityvid/' + abilityName;
				}
				$(this).wrap( '<a href="'+linkURL+'" />' );
			}
			else if ( ttType == 'item' )
			{
				itemName = $(this).attr( 'itemname' );
				linkURL = g_dotaBaseURL + 'items/?item=' + itemName;
				$(this).wrap( '<a href="'+linkURL+'" />' );
			}
			else if ( ttType == 'hero' )
			{
				heroName = $(this).attr( 'heroname' );
				linkURL = g_dotaBaseURL + 'hero/' + g_rgHeroData[heroName].u + '/';
				$(this).wrap( '<a href="'+linkURL+'" />' );
			}
		}
	);
			
}

// if we've already searched image tags for things to tooltip, we've cached the collection of items so
// GetIconCollection will return that collection. if the DOM was modified then, we won't get the new items
// so this can be used to clear the cached collections first
function ClearCachedCollection( ttType, bAllTypes )
{
	if ( ttType == 'item' || bAllTypes )
	{
		g_rgItemIcons = [];
	}
	if ( ttType == 'ability' || bAllTypes )
	{
		g_rgAbilityIcons = [];
	}
	if ( ttType == 'hero' || bAllTypes )
	{
		g_rgHeroIcons = [];
	}
}

// if g_bSearchIMGTags is true, and this is called more than once, IMG tags will only be searched once, subsequent
// calls will return a cached list of items. if DOM is modified between calls, use ClearCachedCollection() above
// before calling this again to have it run through full search
function GetIconCollection( ttType, selectorPrepend )
{
	if ( !selectorPrepend )
	{
		selectorPrepend = '';
	}
	
	if ( !g_bSearchIMGTags )
	{
		selector = selectorPrepend + '.' + eval( 'g_' + ttType + 'IconClass' );
		return $(selector);
	}
	else
	{
		if ( ttType == 'item' && g_rgItemIcons.length )
		{
			return $(g_rgItemIcons);
		}
		if ( ttType == 'ability' && g_rgAbilityIcons.length )
		{
			return $(g_rgAbilityIcons);
		}
		if ( ttType == 'hero' && g_rgHeroIcons.length )
		{
			return $(g_rgHeroIcons);
		}
		g_IMGBaseURL = g_IMGBaseURL.replace( /\//g, '\\/' );
		var searchRE = new RegExp( g_IMGBaseURL + '(abilities|items|heroes)\\/([\\w]+)' );
		$(selectorPrepend+'img').each(
			function( i )
			{
				imgSrc = $(this).attr( 'src' );
				if ( matches = imgSrc.match( searchRE ) )
				{
					imgName = matches[2];
					endOfName = imgName.lastIndexOf( '_' );
					if ( endOfName != -1 )
					{
						name = imgName.substr( 0, endOfName );
						if ( matches[1] == 'items' )
						{
							$(this).attr( 'itemname', name );
							g_rgItemIcons.push( $(this) );
						}
						else if ( matches[1] == 'abilities' )
						{
							$(this).attr( 'abilityname', name );
							g_rgAbilityIcons.push( $(this) );
						}
						else if ( matches[1] == 'heroes' )
						{
							$(this).attr( 'heroname', name );
							g_rgHeroIcons.push( $(this) );
						}
					}
				}
			}
		);
		if ( ttType == 'item' )
		{
			return $(g_rgItemIcons);
		}
		else if ( ttType == 'ability' )
		{
			return $(g_rgAbilityIcons);
		}
		else if ( ttType == 'hero' )
		{
			return $(g_rgHeroIcons);
		}
	}
	return [];
}

function HeropediaDFReceive( dataJSON )
{
	if ( dataJSON['itemdata'] )
	{
		g_rgItemData = dataJSON['itemdata'];
		g_bItemDataReady = true;
		if ( g_bWrapItems )
		{
			WrapIconsWithLinks( 'item' );
		}
	}
	if ( dataJSON['abilitydata'] )
	{
		g_rgAbilityData = dataJSON['abilitydata'];
		g_bAbilityDataReady = true;
		if ( g_bWrapAbilities )
		{
			WrapIconsWithLinks( 'ability' );
		}
	}
	if ( dataJSON['herodata'] )
	{
		g_rgHeroData = dataJSON['herodata'];
		g_bHeroDataReady = true;
		if ( g_bWrapHeroes )
		{
			WrapIconsWithLinks( 'hero' );
		}
	}
}

function LoadTooltipCSS()
{
	if ( g_bTooltipCSSLoaded )
		return;
	// add tooltips css to doc
	$('<link>').attr(
		{
			rel:"stylesheet",
			type:"text/css",
			href:"../public/stylesheets/watchCSS/tooltips.css?v=mIglP2q-7ajT"
		}
	).appendTo('head');
	g_bTooltipCSSLoaded = true;
}

function LoadHeropediaData( rgFeeds )
{
	// see if we've already loaded any of the requested feeds
	rgNeededFeeds = [];
	outerloop:
	for ( x = 0; x < rgFeeds.length; x++ )
	{
		innerloop:
		for ( y = 0; y < g_rgRequestedFeeds.length; y++ )
		{
			if ( rgFeeds[x] == g_rgRequestedFeeds[y] )
				continue outerloop;
		}
		rgNeededFeeds.push( rgFeeds[x] );
		g_rgRequestedFeeds.push( rgFeeds[x] );
	}
	if ( !rgNeededFeeds.length )
		return;

	strFeeds = rgNeededFeeds.join(',');
	var URL = ( location.protocol == 'https:' ) ? 'https://www.dota2.com/' : 'http://www.dota2.com/';
	URL = URL + 'jsfeed/heropediadata?feeds='+strFeeds+'&v=3504183mIglP2q-7ajT&l=schinese';
	$.ajax(
		{
			type:'GET',
			cache:true,
			url: URL,
			dataType:'jsonp',
			jsonpCallback:'HeropediaDFReceive'
		}
	);
}

function BuildItemTooltipHTML( itemName )
{
	iData = g_rgItemData[itemName];
	strHTML = '';

	// Allow callers to add more data here
	if ( g_tooltipInsertCallback !== null ) {
		strHTML += g_tooltipInsertCallback( itemName );
	}

	strHTML += '<div class="itemIcon"><img src="http://cdn.dota2.com/apps/dota2/images/items/'+iData.img+'" width="74" height="56" alt="'+iData.dname+'" title="'+iData.dname+'" border="0" /></div>';
	strHTML += '<div class="itemName quality_'+iData.qual+'">'+iData.dname+'</div>';
	strHTML += '<div class="goldIcon"><img src="http://cdn.dota2.com/apps/dota2/images/tooltips/gold.png" width="25" height="17" border="0" /></div>';
	strHTML += '<div class="goldCost">'+iData.cost+'</div><br clear="left" /><div class="description">'+iData.desc+'</div>';
	if ( iData.notes )
	{
		strHTML += '<div class="notes">'+iData.notes+'</div>';
	}
	strHTML += '<div class="attribs">'+iData.attrib+'</div>';
	if ( iData.mc || iData.cd )
	{
		strHTML += '<div class="cooldownMana">';
		if ( iData.mc )
		{
			strHTML += '<div class="mana"><img alt="魔法消耗" title="魔法消耗" class="manaImg" src="http://cdn.dota2.com/apps/dota2/images/tooltips/mana.png" width="22" height="22" border="0" />'+iData.mc+'</div>';
		}
		if ( iData.cd )
		{
			strHTML += '<img alt="冷却时间" title="冷却时间" class="cooldownImg" src="http://cdn.dota2.com/apps/dota2/images/tooltips/cooldown.png" width="22" height="22" border="0" />'+iData.cd+'<br clear="left" />';
		}
		strHTML += '<br clear="left" /></div>';
	}
	strHTML += '<div class="lore">'+iData.lore+'</div>';

	return strHTML;
}

function BuildAbilityTooltipHTML( abilityName )
{
	aData = g_rgAbilityData[abilityName];
	var strHTML = '';

	// Allow callers to add more data here
	if ( g_tooltipInsertCallback !== null ) {
		strHTML += g_tooltipInsertCallback( abilityName );
	}

	if ( aData !== undefined ) {
		strHTML += '<div class="abilityName">'+aData.dname+'</div>';
		strHTML += '<div class="abilityHR1"></div>';
		strHTML += '<div class="abilityTarget">'+aData.affects+'</div>';
		strHTML += '<div class="abilityHR2"></div>';
		strHTML += '<div class="abilityDesc">'+aData.desc+'</div>';
		if ( aData.notes )
		{
			strHTML += '<div class="abilityNotes">'+aData.notes+'</div>';
		}
		strHTML += '<div class="abilityDmg">'+aData.dmg+'</div>';
		strHTML += '<div class="abilityAttrib">'+aData.attrib+'</div>';
		strHTML += '<div class="abilityCMB">'+aData.cmb+'</div>';
		strHTML += '<div class="abilityLore">'+aData.lore+'</div>';
	}
	else if ( abilityName === 'attribute_bonus' ) {
		// This is a special case for the attribute bonus, which is only shown by the editor
		strHTML += '<div class="abilityName">'+"附加属性"+'</div>';
		strHTML += '<div class="abilityHR1"></div>';
		strHTML += '<div class="abilityDesc">'+"附加属性将直接影响英雄的三种属性数值：力量、敏捷和智力。"+'</div>';
	}

	return strHTML;
}

function BuildHeroTooltipHTML( heroName )
{
	hData = g_rgHeroData[heroName];
	var strHTML = '';

	// Allow callers to add more data here
	if ( g_tooltipInsertCallback !== null ) {
		strHTML += g_tooltipInsertCallback( heroName );
	}
	
	strHTML += '<div class="heroName">'+hData.dname+'</div>';
	if ( g_bHeroTTNameOnly )
	{
		return strHTML;
	}
	strHTML += '<div class="heroRoles"><span class="heroAttackCability">'+hData.dac+'</span> - '+hData.droles+'</div>';
	strHTML += '<div class="heroPrimaryStats">';
	strHTML += '<img style="top:'+(hData.pa=='str'?'42px':(hData.pa=='agi'?'21px':'0px'))+'" class="overviewIcon_Primary" src="http://cdn.dota2.com/apps/dota2/images/heropedia/overviewicon_primary_2.png" width="20" height="19" />';
	strHTML += '<img title="Intelligence" class="overviewIcon_Int" src="http://cdn.dota2.com/apps/dota2/images/heropedia/overviewicon_int_2.png" width="16" height="16" />';
	strHTML += '<div class="overview_StatVal overview_IntVal'+(hData.pa=='int'?' primaryVal':'')+'">'+hData.attribs.int.b+' + '+hData.attribs.int.g+'</div>';
	strHTML += '<img title="Agility" class="overviewIcon_Agi" src="http://cdn.dota2.com/apps/dota2/images/heropedia/overviewicon_agi_2.png" width="16" height="16" />';
	strHTML += '<div class="overview_StatVal overview_AgiVal'+(hData.pa=='agi'?' primaryVal':'')+'">'+hData.attribs.agi.b+' + '+hData.attribs.agi.g+'</div>';
	strHTML += '<img title="Strength" class="overviewIcon_Str" src="http://cdn.dota2.com/apps/dota2/images/heropedia/overviewicon_str_2.png" width="16" height="16" />';
	strHTML += '<div class="overview_StatVal overview_StrVal'+(hData.pa=='str'?' primaryVal':'')+'">'+hData.attribs.str.b+' + '+hData.attribs.str.g+'</div>';
	strHTML += '<img title="Damage" class="overviewIcon_Attack" src="http://cdn.dota2.com/apps/dota2/images/heropedia/overviewicon_attack_2.png" width="23" height="18" />';
	strHTML += '<div class="overview_StatVal overview_AttackVal">'+hData.attribs.dmg.min+' - '+hData.attribs.dmg.max+'</div>';
	strHTML += '<img title="Movespeed" class="overviewIcon_Speed" src="http://cdn.dota2.com/apps/dota2/images/heropedia/overviewicon_speed_2.png" width="31" height="19" />';
	strHTML += '<div class="overview_StatVal overview_SpeedVal">'+hData.attribs.ms+'</div>';
	strHTML += '<img title="Armor" class="overviewIcon_Defense" src="http://cdn.dota2.com/apps/dota2/images/heropedia/overviewicon_defense_2.png" width="19" height="18" />';
	strHTML += '<div class="overview_StatVal overview_DefenseVal">'+hData.attribs.armor+'</div>';
	strHTML += '</div>';
	
	return strHTML;
}

function ShowTooltip( iconType, iconElement, bShow )
{
	// these will be added & removed from the global tooltip when shown
	// to allow base size/style variation for types
	classesPerIconType = {
		item: 'iconTooltip_item',
		ability: 'iconTooltip_ability',
		hero: 'iconTooltip_hero'
	};

	// make sure we have the tooltip data from the ajax call
	if ( iconType == 'item' && !g_bItemDataReady )
		return;
	if ( iconType == 'ability' && !g_bAbilityDataReady )
		return;
	if ( iconType == 'hero' && !g_bHeroDataReady )
		return;
	
	// this is the element that fired the hover
	iconElement = $(iconElement);
	
	if ( !bShow )
	{
		$('#iconTooltip').hide();
		clearTimeout( g_tooltipDelayCount );
	}
	else
	{
		// we don't have a tooltip div yet, create it
		if ( !$('#iconTooltip').length )
		{
			tooltipElement = $( $('<div>') ).appendTo('body');
			tooltipElement.attr( 'id', 'iconTooltip' );
			tooltipElement.addClass('iconTooltip').addClass( 'DotaFont' );
		}
		tooltipElement = $('#iconTooltip');
		
		// remove old type-specific classes, add the one for this tooltip type
		$.each( classesPerIconType,
			function( ttType, className )
			{
				if ( ttType == iconType )
				{
					tooltipElement.addClass( className );
				}
				else
				{
					tooltipElement.removeClass( className );
				}
			}
		);
		
		if ( iconType == 'item' )
		{
			itemName = iconElement.attr('itemname');
			tooltipElement.html( BuildItemTooltipHTML( itemName ) );
		}
		else if ( iconType == 'ability' )
		{
			abilityName = iconElement.attr('abilityname');
			tooltipElement.html( BuildAbilityTooltipHTML( abilityName ) );
		}
		else if ( iconType == 'hero' )
		{
			heroName = iconElement.attr('heroname');
			tooltipElement.html( BuildHeroTooltipHTML( heroName ) );
		}
		iconElementPos = iconElement.offset();
		// see if center of icon is left or right of viewport center to know where to anchor the tip
		bAnchorToIconLeft = ( iconElementPos.left+(iconElement.outerWidth()/2) > ($(window).width()/2) ) ? true : false;
		iArrowWidth = 0;
		iArrowHeight = 34;
		// how far down from top is arrow and which image to use (gradient different for different height)
		if ( iconType == 'hero' && g_bHeroTTNameOnly )
		{
			iArrowVOffset = 0;
			strArrowStyleSuffix = '';//'_Big';
		}
		else
		{
			iArrowVOffset = 0;
			strArrowStyleSuffix = '';//'_Small';
		}
		tooltipElement.css(
			{
				top:iconElementPos.top+(iconElement.outerHeight()/2)-(iArrowHeight/2)-iArrowVOffset,
				left:iconElementPos.left + ( bAnchorToIconLeft ? (tooltipElement.outerWidth()+iArrowWidth+13)*-1 : iconElement.outerWidth()+iArrowWidth )
			}
		);
		
		positionDiff = 0;
		tooltipElement.show();
		if ( ( tooltipElement.offset().top + tooltipElement.outerHeight() ) > ($(window).height() + $(window).scrollTop()) )
		{
			// get diff for moving arrow position
			positionDiff = tooltipElement.offset().top - ( ($(window).height() + $(window).scrollTop()) - tooltipElement.outerHeight() );
			tooltipElement.css( { top:($(window).height() + $(window).scrollTop()) - tooltipElement.outerHeight() } );
		}
		// create our little arrow between the tooltip and item we're hovering over
		if ( !bAnchorToIconLeft )
		{
			$('<div>').addClass( 'BaseArrow' ).addClass( 'ArrowLeft' + strArrowStyleSuffix ).css(
				{
					left:-iArrowWidth,
					top:iArrowVOffset + positionDiff
				}
			).appendTo(tooltipElement);
		}
		else
		{
			$('<div>').addClass( 'BaseArrow' ).addClass( 'ArrowRight' + strArrowStyleSuffix ).css(
				{
					left:tooltipElement.outerWidth()-4,
					top:iArrowVOffset + positionDiff
				}
			).appendTo(tooltipElement);
		}
		
		// show the tooltip
		tooltipElement.show();
	}
}






