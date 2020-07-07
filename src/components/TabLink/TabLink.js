// @flow

import React, { useState, Fragment, useEffect } from "react";

import {
    MainContainer,
    TabsContainer,
    Tab,
    Body
} from "./TabLink.styles";

import type { ComponentType } from "react";
import type {
    TabLinkContainerProps,
    TabLinkProps
} from "./TabLink.types";
import { Plotter } from "components/Plotter";
import { dropLeadingZeros, getPlotData, groupBy } from "common/utils";
import { DataTable } from "components/GovUk";
import useApi from "hooks/useApi";
import Loading from "components/Loading";


// This is a pseudo-component created to make the implementation of
// containers easier and more consistent.
export const TabLink: ComponentType<TabLinkProps> = function ({ label, children }) {

    return <Fragment/>

}  // TabLink


export const TabLinkContainer: ComponentType<TabLinkContainerProps> = ({ children }) => {

    if ( !(children?.length ?? 0) )
        throw new Error(`Component "TabLinkContainer" must have at least two children (of type "TabLink").`);

    const [ current, setCurrent ] = useState(children[0].props.label);

    return <MainContainer>
        <TabsContainer>{
            children.map(({ props: { label } }, index) =>
                <Tab type={ "link" }
                     key={ `${label}-${index}` }
                     className={ `${label === current ? 'active govuk-!-font-weight-bold' : '' }` }
                     onClick={ () => setCurrent(label)  }
                >
                     { label }
                </Tab>
            )
        }</TabsContainer>
        {
            children.map(({ props: { label, children } }, index) =>
                label === current
                    ? <Body key={ `${label}-child-${index}` }>
                        { children }
                    </Body>
                    : null
            )
        }
    </MainContainer>

};  // TabLinkContainer



const TabContentWithData: ComponentType<TabContentProps> = ({ fields, tabType, barType=null, data=[], xKey="date", ...props }) => {

    switch ( tabType ) {

        case "chart":
            const layout = {};
            if ( barType ) layout["barmode"] = barType;


            return <Plotter data={ getPlotData(fields, data, xKey) } layout={ layout } { ...props }/>

        case "table":
            return <DataTable fields={ fields } data={ data } { ...props }/>;

        default:
            return null;

    }

};


export const TabContent: TabContentType<TabContentProps> = ({ fields, setDataState, params, tabType, barType=null }: TabContentProps): React$Component => {

    const  structure = { date: "date" };

    for ( const { value } of fields )
        structure[value] = value;

    const
        data = useApi({
            conjunctiveFilters: params,
            structure: structure,
            defaultResponse: null
        });

    useEffect(() => {

        if ( data !== null && ( data?.length ?? 0 ) < 1 )
            setDataState(false);

    }, [ data ])

    if ( data === null )
        return <Loading/>;

    return <TabContentWithData data={ data } fields={ fields } tabType={ tabType } barType={ barType }/>

};  // TabContent


const ageSortByKey = (a, b) => {

    const
        ageA = parseInt(/(\d+)/.exec(a.age)[1]),
        ageB = parseInt(/(\d+)/.exec(b.age)[1]);

    return ( ageA > ageB ) || -(ageA < ageB || 0)

}; // ageSexSort


export const AgeSexBreakdownTabContent = ({ params, setDataState, groupKey, groupValues, requiredMetrics=[], fields=[], ...props }) => {

    // Assumptions:
    // Both categories have the same data type, same groups, same
    // length, and same structure.

    const structure = {};

    for ( const metric of requiredMetrics )
        structure[metric] = metric;

    const
        dataRaw = useApi({
            conjunctiveFilters: params,
            structure: structure,
            extraParams: [
                fields && { key: "latestBy", sign: "=", value: requiredMetrics[0] }
            ],
            defaultResponse: null
        });

    useEffect(() => {

        if ( dataRaw !== null && ( dataRaw?.length ?? 0 ) < 1 )
            setDataState(false);

    }, [ dataRaw ])

    if ( dataRaw === null ) return <Loading/>;

    const
        dataGrouped = groupBy(
            requiredMetrics
                .map(metric =>
                    dataRaw?.[0]?.[metric]
                        .map(item => {
                            for ( const key of groupValues ) {
                                const keyName = key.replace(/^(\w)/, letter => letter.toUpperCase());
                                item[metric + keyName] = !!(item[key] % 1) ? parseFloat(item[key].toFixed(1)) : item[key];
                                item[groupKey] = item[groupKey].replace(/(_|to)/g, found => found === "to" ? "-" : " ");
                                delete item[key]
                            }
                            return item
                        })
                )
            .reduce((acc, item) => [...acc, ...(item ? item : [])], []),
            item => item[groupKey]
        ),
        data = Object
            .keys(dataGrouped)
            .reduce((acc, key) =>
                [
                    ...acc,
                    dataGrouped[key].reduce((innerAcc, item) => ({...innerAcc, ...item}), {})
                ], []
            )
            .sort(ageSortByKey);

    return <TabContentWithData { ...props } fields={ fields } data={ data } isTimeSeries={ false } xKey={ groupKey }/>

};  // AgeSexBreakdownTabContent


export const MultiAreaStaticTabContent = ({ params, setDataState, groupKey, groupValues, requiredMetrics=[], fields=[], ...props }) => {

    const
        data = useApi({
            conjunctiveFilters: params,
            structure: {
                date: "date",
                areaName: "areaName",
                ...fields.reduce((acc, { value }) => ({ ...acc, [value]: value }), {})
            },
            defaultResponse: null
        });

    useEffect(() => {

        if ( data !== null && ( data?.length ?? 0 ) < 1 )
            setDataState(false);

    }, [ data ])

    if ( !data ) return <Loading/>;

    const
        groups = groupBy(
            dropLeadingZeros(data, ...fields.map(({ value }) => value)),
            item => item.date
        ),
        newData = [];

    let row, sortedGroups;

    for ( const date in groups ) {

        row = { date: date };

        sortedGroups = groups[date]
            .sort(({ areaName: a }, { areaName: b }) => a > b || -(b > a || 0));

        for ( const { areaName, ...rest } of sortedGroups ) {
            row = {
                ...row,
                ...fields.reduce((acc, { value }) => ({ ...acc, [`${areaName}${value}`]: rest?.[value] ?? null }), {})
            }
        }

        newData.push( row )

    }

    const
        isTable = (props?.tabType ?? null) === 'table',
        areaNames = Object.keys(groupBy(data, item => item.areaName)),
        newFields = [
            ...isTable
                ? [{ value: "date", label: "Date", type: "date" }]
                : [],
            ...fields
                .filter(item => item.value !== 'date')
                .reduce((acc, { value, label, ...rest }) => ([
                ...acc,
                ...areaNames.map((areaName, index) => ({
                    ...rest,
                    value: `${ areaName }${ value }`,
                    label: `${ areaName }${ isTable ? " " : "" } ${ label }`,
                    colour: props?.colours?.[index] ?? index
                }))
            ]), [])
        ];

    return <TabContentWithData { ...props } fields={ newFields } data={ newData }/>

};  // CustomTabContent


export const SimpleTable = ({ setDataState, params, latestBy="", fields=[], sortBy="", ...props }) => {

    const
        data = useApi({
            conjunctiveFilters: params,
            structure: {
                ...fields.reduce((acc, { value }) => ({ ...acc, [value]: value }), {})
            },
            extraParams: [
                { key: "latestBy", sign: "=", value: latestBy }
            ],
            defaultResponse: null
        });

    useEffect(() => {

        if ( data !== null && ( data?.length ?? 0 ) < 1 )
            setDataState(false);

    }, [ data ])

    if ( !data ) return <Loading/>;

    return <TabContentWithData { ...props }
                               fields={ fields }
                               data={ data
                                   .sort(({ [sortBy]: a=null }, { [sortBy]: b=null }) =>
                                       (a > b) || -((a < b) || 0)
                                   )
                               }/>

};  // Tabulation
